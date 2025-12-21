# Backup Vault

A powerful backup and file transfer extension for Visual Studio Code that simplifies versioned backups and file distribution workflows.

## Features

### 🔄 Versioned Backup Creation
- Create timestamped backups with custom version suffixes
- Intelligent file handling: single files get suffix inserted before extension, multiple files are packed into folders
- Configurable backup output directories
- Overwrite protection with user confirmation
- PowerShell-powered backup operations for robust file handling

### 📤 File Transfer Operations
- Send selected files and folders to configured destination directories
- Recursive copying with full directory structure preservation
- Overwrite confirmation for existing files
- Real-time progress feedback and completion notifications

### 🎛️ Interactive Selection Interface
- Visual workspace tree view for intuitive file/folder selection
- Smart selection logic: parent folder selection automatically excludes children
- Selection summary showing folder/file counts and total items
- Bulk operations with select all/none functionality
- Persistent selection state across sessions

### ⚙️ Comprehensive Configuration
- **Output Directory**: Set where backups are stored
- **Sending Directory**: Configure file transfer destination
- **Version Suffix**: Customize backup versioning (default: "v")
- **File Packing**: Toggle folder creation for backups (auto-enabled for multiple selections)
- **Folder Name**: Set custom names for packed backup folders
- Persistent settings saved across VS Code sessions

## Usage

### Setting Up Directories
1. Open the **Backup Vault** panel in the Explorer sidebar
2. Expand **⚙️ Backup Settings**
3. Click **📁 Output Directory** to set where backups are saved
4. Click **📤 Sending Directory** to set file transfer destination

### Creating Backups
1. Select files/folders in the **Backup Vault** tree view (checkmarks indicate selection)
2. Run **Backup Vault: Create Backup** from the command palette (`Ctrl+Shift+P`)
3. Enter your version number when prompted (e.g., "1.2.3" or "20231221")
4. Confirm overwrite if a backup with that version already exists

### Transferring Files
1. Select files/folders in the **Backup Vault** tree view
2. Ensure sending directory is configured in settings
3. Run **Backup Vault: Send Files** from the command palette
4. Confirm overwrite if files already exist at destination

### Advanced Configuration
- **Version Suffix**: Click to change from default "v" to "_", "ver", etc.
- **File Packing**: Toggle to control whether single files are packed into folders
- **Folder Name**: Set custom name for packed backup folders (default: "Backup")

## Requirements

- **VS Code**: 1.70.0 or higher
- **Operating System**: Windows (PowerShell required for backup operations)
- **PowerShell**: Must be available in system PATH

## Installation

Install from the VS Code Marketplace or download the .vsix file and install manually.

## Architecture

The extension consists of:
- **Tree View Interface**: Custom VS Code tree data provider for file selection
- **PowerShell Integration**: External script execution for robust backup operations
- **Configuration System**: Workspace state persistence for settings
- **File Operations**: Node.js fs module for file transfer operations

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

This extension is licensed under the MIT License.

## Support

If you encounter any issues or have feature requests, please create an issue on the GitHub repository.
