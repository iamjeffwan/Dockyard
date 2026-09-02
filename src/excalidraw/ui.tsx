import { useState, type ReactNode } from "react";
import { MainMenu, Sidebar, useHandleLibrary } from "@excalidraw/excalidraw";
import { Check, FolderOpen, ImagePlus, Save } from "lucide-react";

export function StorybookSidebarShell({ children }: { children: ReactNode }) {
  const [docked, setDocked] = useState(false);
  return (
    <Sidebar name="dockyard-storybook" docked={docked} onDock={setDocked}>
      <Sidebar.Tabs>
        <Sidebar.Tab tab="stories">
          <Sidebar.Header>
            <div className="storybook-panel-heading"><strong>组件 Stories</strong></div>
          </Sidebar.Header>
          {children}
        </Sidebar.Tab>
      </Sidebar.Tabs>
    </Sidebar>
  );
}

export function StorybookSidebarTrigger() {
  return <Sidebar.Trigger name="dockyard-storybook" tab="stories" title="打开组件 Stories">组件 Stories</Sidebar.Trigger>;
}

export function CanvasMainMenu({
  hasArtwork,
  onChooseArtwork,
  onSave,
  onExportImage,
  onComplete,
}: {
  hasArtwork: boolean;
  onChooseArtwork: () => void;
  onSave: () => void;
  onExportImage: () => void;
  onComplete: () => void;
}) {
  return (
    <MainMenu>
      <MainMenu.Item icon={<FolderOpen size={16} />} onSelect={onChooseArtwork}>选择图稿</MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.Item icon={<Save size={16} />} onSelect={onSave} disabled={!hasArtwork}>保存到 Dockyard</MainMenu.Item>
      <MainMenu.Item icon={<ImagePlus size={16} />} onSelect={onExportImage} disabled={!hasArtwork}>导出图片</MainMenu.Item>
      <MainMenu.Item icon={<Check size={16} />} onSelect={onComplete} disabled={!hasArtwork}>完成并记录</MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.Group title="Excalidraw links"><MainMenu.DefaultItems.Socials /></MainMenu.Group>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
}

export function LibraryHandler({ excalidrawAPI }: { excalidrawAPI: unknown }) {
  useHandleLibrary({ excalidrawAPI: excalidrawAPI as never });
  return null;
}
