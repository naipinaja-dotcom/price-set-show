import { supabase } from "@/integrations/supabase/client";

type SupabaseClient = typeof supabase;

// Fetch all rows from a Supabase query that may exceed the 1000-row API limit.
// Builder is a function that receives (from, to) range parameters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(
  builder: (client: SupabaseClient, from: number, to: number) => ReturnType<any["range"]>,
  pageSize = 1000,
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await builder(supabase, from, from + pageSize - 1);
    if (error) throw error;
    results.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return results;
}
