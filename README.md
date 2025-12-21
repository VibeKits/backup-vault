# Backup Vault

VS Code extension for secure file backup and transfer with data integrity verification.

## How It Works

- **SHA-256 Verification**: Every file is hashed before and after operations to detect corruption
- **Native Node.js Operations**: Direct file system access without external dependencies
- **Retry Logic**: Automatic retry with exponential backoff for transient failures
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **Memory Efficient**: Streaming operations prevent memory issues with large files

## Features

### Backup Operations
- Versioned backups with configurable suffixes (e.g., `filename_v1.0.ext`)
- Automatic file packing for multiple selections
- Directory structure preservation
- Overwrite protection with confirmation dialogs

### File Transfer
- Recursive copying with progress feedback
- Configurable source and destination directories
- Batch operations for multiple files/folders

### Selection Interface
- Visual tree view for file/folder selection
- Parent-child deselection logic
- Selection summaries with item counts
- Bulk operations (select all, select none, toggle)

### Configuration
- Persistent settings storage
- Custom output and sending directories
- Configurable version suffixes and folder names
- File packing toggle

## Use Cases

### Software Development
- Project versioning and code backups
- Release artifact management
- Cross-platform development workflows

### Content Creation
- Asset library backups
- Project file versioning
- Digital media organization

### Data Analysis
- Dataset integrity verification
- Research data archiving
- Analytical workflow backups

### System Administration
- Configuration file backups
- Log file management
- Automated backup scripts

## Usage

### Creating Backups
1. Open Backup Vault panel in Explorer sidebar
2. Select files/folders to backup
3. Run "Backup Vault: Create Backup" command
4. Enter version number when prompted

### Transferring Files
1. Configure sending directory in panel settings
2. Select source files/folders
3. Run "Backup Vault: Send Files" command

### Configuration
Access settings through the Backup Vault panel:
- Output Directory: Backup destination path
- Sending Directory: Transfer destination path
- Version Suffix: Backup naming prefix (default: "v")
- File Packing: Enable for multiple file selections

## Requirements

- VS Code 1.70.0 or higher
- Node.js (built-in with VS Code)

## Installation

Install from VS Code Marketplace or manually install .vsix file.

## Technical Details

- **Data Integrity**: SHA-256 hashing ensures 100% content verification
- **Error Handling**: Comprehensive recovery from file system errors
- **Performance**: Streaming I/O prevents memory exhaustion
- **Compatibility**: Native operations work across all supported platforms

## License

MIT License
