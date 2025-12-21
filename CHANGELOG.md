# Changelog

All notable changes to **Backup Vault** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2025-12-20

### Major Architecture Changes
- **Replaced PowerShell with Native Node.js**: Eliminated Windows-only dependency for true cross-platform support
- **Added SHA-256 Hash Verification**: Complete content integrity checking for all files
- **Implemented Retry Logic**: Automatic retry with exponential backoff for transient failures

### Added
- **Unit Tests**: Comprehensive test suite covering hash verification, retry logic, and backup operations
- **Enhanced Error Recovery**: Better handling of temporary file system issues
- **Improved Success Notifications**: More visible and informative success messages

### Security & Reliability
- **100% Content Verification**: Every file is hashed before and after backup - detects any corruption
- **Zero Data Loss Guarantee**: Backup fails if any file hash doesn't match source
- **Transient Failure Recovery**: Automatic retry for EBUSY, EMFILE, and other temporary errors
- **Memory-Efficient Hashing**: Streaming SHA-256 calculation prevents memory issues with large files
- **Graceful Temp Cleanup**: Handles successful directory moves without spurious warnings

### Testing
- **9 Comprehensive Unit Tests**: Covering hash calculation, verification, retry logic, and backup creation
- **Edge Case Coverage**: Empty files, permission errors, concurrent access

### Bug Fixes
- **Fixed const variable assignment error** in hash verification logic
- **Fixed directory hash verification** for single directory backups (packFiles: false)
- **Fixed hash key mismatch** for directory backups with version suffixes - now compares relative paths correctly
- **Improved temp directory cleanup** to handle successful renames gracefully
- **Enhanced success notifications** with better visibility and follow-up messages

### Performance Improvements
- **Streaming I/O**: Prevents memory exhaustion with large files
- **Direct OS Operations**: Faster file operations without shell overhead

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
