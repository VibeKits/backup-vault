# Changelog

All notable changes to **Backup Vault** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2025-12-19

### Added
- **Initial Release**: VS Code extension for versioned backups and file transfer operations

### Backup System
- **Versioned Backup Creation**: Create backups with custom version suffixes using PowerShell
- **Intelligent File Handling**: Single files get suffix inserted before extension, multiple files packed into timestamped folders
- **Output Directory Configuration**: User-configurable backup storage location
- **Overwrite Protection**: Confirmation dialogs prevent accidental overwrites
- **Backup Validation**: Success/failure notifications with destination path reporting

### File Transfer
- **Send Files Command**: Transfer selected files/folders to configured destination
- **Recursive Copying**: Full directory structure preservation during transfer
- **Transfer Validation**: Overwrite confirmations and completion status reporting
- **Error Handling**: Comprehensive error reporting for failed transfers

### User Interface
- **Tree View Panel**: Visual workspace file browser in VS Code Explorer
- **Smart Selection Logic**: Parent-child relationship handling (parent selection excludes children)
- **Selection Summary**: Real-time display of selected folders, files, and total item counts
- **Interactive Settings**: Click-to-edit configuration for all backup parameters
- **Persistent State**: Selection and settings preserved across VS Code sessions

### Configuration System
- **Output Directory**: Configurable backup destination
- **Sending Directory**: Configurable file transfer destination
- **Version Suffix**: Customizable backup versioning prefix (default: "v")
- **File Packing Toggle**: Control folder creation for single-file backups
- **Folder Name**: Custom naming for packed backup folders
- **Workspace State Persistence**: Settings saved automatically

### Commands
- `backup-generator.run`: Create versioned backup
- `backup-generator.sendFiles`: Transfer selected files
- `backup-generator.refresh`: Refresh tree view
- `backup-generator.toggleSelection`: Toggle file/folder selection
- `backup-generator.selectAll`: Select all items in current folder
- `backup-generator.selectNone`: Clear all selections
- `backup-generator.editOutputDir`: Configure backup output directory
- `backup-generator.editSendingDir`: Configure file transfer destination
- `backup-generator.editSuffix`: Customize version suffix
- `backup-generator.togglePack`: Toggle file packing option
- `backup-generator.editFolderName`: Set custom folder name for packed backups
- `backup-generator.selectionSummary`: Display selection statistics

### Technical Implementation
- **VS Code Extension API**: Full integration with VS Code tree data providers and commands
- **PowerShell Integration**: External script execution for backup operations
- **Node.js File Operations**: Native filesystem operations for file transfer
- **Error Handling**: Comprehensive validation and user feedback
- **Cross-Platform Compatibility**: Windows-focused with PowerShell dependency
- **Memory Management**: Efficient tree view with lazy loading of directory contents

## Development
- Built with Node.js and VS Code Extension API
- Modular architecture with separate extension and tree provider classes
- TypeScript-ready structure (JavaScript implementation)
- Comprehensive error handling and logging
- Event-driven architecture with VS Code's tree data provider pattern
