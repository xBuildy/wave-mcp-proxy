# Wave OS Portal for VS Code/Cursor

The Wave OS Portal extension brings real-time capabilities and tools of the Wave OS platform directly into your favorite editor (VS Code or Cursor).

## Features

- **Native Sidebar Panel**: Access your workspace, view notifications, and manage options seamlessly.
- **Real-Time Credit Tracking**: Keep an eye on your usage with automatic, live balance and credit cards updates.
- **Activity Feed**: View real-time status and logs of your background tasks, builds, and integrations.
- **Open Wave OS Button**: A quick-launch button to jump straight into the full Wave OS web platform.

## Requirements

- **Cursor** or **VS Code 1.74+**

## Installation

### Option 1: Via Command Line
1. Download the packaged extension file: `wave-os-portal-1.0.0.vsix`.
2. Open your terminal and run one of the following commands:
   * **For VS Code**:
     ```bash
     code --install-extension wave-os-portal-1.0.0.vsix
     ```
   * **For Cursor**:
     ```bash
     cursor --install-extension wave-os-portal-1.0.0.vsix
     ```

### Option 2: Via VS Code / Cursor UI
1. Open the **Extensions** view (Ctrl+Shift+X or Cmd+Shift+X).
2. Click the **More Actions** menu button (`...` at the top right of the Extensions view).
3. Select **Install from VSIX...** from the dropdown menu.
4. Locate and select the `wave-os-portal-1.0.0.vsix` file.

## Settings

This extension contributes the following settings:

* `wave-os-portal.backendUrl`: The URL of the Wave OS backend proxy. 
  * **Default**: `https://oswave.io/functions/mcpRouter`
