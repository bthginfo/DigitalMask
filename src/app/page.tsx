import { WorkspaceProvider } from "@/components/workspace-context";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ConfirmProvider } from "@/components/confirm-dialog";
export default function Home() {
  return (
    <ConfirmProvider>
      <WorkspaceProvider>
        <WorkspaceShell />
      </WorkspaceProvider>
    </ConfirmProvider>
  );
}
