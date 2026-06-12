import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/feed")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
