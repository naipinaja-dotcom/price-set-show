import { createFileRoute } from "@tanstack/react-router";
import { PricingForm } from "@/components/pricing-form";

export const Route = createFileRoute("/admin/pricing/$id")({
  component: EditPage,
});

function EditPage() {
  const { id } = Route.useParams();
  return <PricingForm mode="edit" schemeId={id} />;
}
