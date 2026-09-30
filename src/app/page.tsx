import { WorkspaceProvider } from "@/components/workspace-context";
import { WorkspaceShell } from "@/components/workspace-shell";
export default function Home() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
