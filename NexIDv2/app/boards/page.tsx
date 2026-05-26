import { BoardsPageClient } from "@/components/nexid/boards/boards-page-client";
import { NexidAppShell } from "@/components/nexid/shared/app-shell";

export default function BoardsPage() {
  return (
    <NexidAppShell>
      <BoardsPageClient />
    </NexidAppShell>
  );
}
