import { createFileRoute } from "@tanstack/react-router";
import { PricingForm } from "@/components/pricing-form";

export const Route = createFileRoute("/admin/pricing/new")({
  component: () => <PricingForm mode="create" />,
});
