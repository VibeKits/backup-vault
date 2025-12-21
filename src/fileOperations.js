const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');
const crypto = require('crypto');

class FileOperations {
  constructor() {
    this.tempFiles = new Set();
  }

  /**
   * Retry a function with exponential backoff
   */
  async _retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        const isRetryable = this._isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.log(`FileOperations: Operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable
   */
  _isRetryableError(error) {
    // Common retryable error patterns
    const retryablePatterns = [
      'EBUSY',           // Resource busy
      'EMFILE',          // Too many open files
      'ENFILE',          // File table overflow
      'EAGAIN',          // Resource temporarily unavailable
      'EINTR',           // Interrupted system call
      'ETXTBSY',         // Text file busy
      'resource busy',   // Generic busy message
      'temporarily unavailable' // Generic unavailable message
    ];

    const errorMessage = error.message.toLowerCase();
    const errorCode = error.code;

    return retryablePatterns.some(pattern =>
      errorMessage.includes(pattern.toLowerCase()) ||
      (errorCode && errorCode.includes(pattern.toUpperCase()))
    );
  }

  /**
   * Main backup creation function - replaces PowerShell script
   */
  async createBackup(options) {
    const {
      sources,
      outputDir,
      version,
      packFiles,
      folderName,
      suffix,
      force = false,
      onProgress = null,
      deselected = []
    } = options;

    console.log('FileOperations: Starting backup creation', {
      sources: sources.length,
      outputDir,
      version,
      packFiles,
      folderName,
      suffix,
      force
    });

    try {
      // Validate inputs
      if (!sources || !Array.isArray(sources) || sources.length === 0) {
        throw new Error('No sources specified');
      }
      if (!outputDir) {
        throw new Error('No output directory specified');
      }
      if (!version) {
        throw new Error('No version specified');
      }

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Validate all sources exist
      for (const source of sources) {
        try {
          await fs.access(source);
        } catch (error) {
          throw new Error(`Source not found: ${source}`);
        }
      }

      // Determine if we need to pack
      const shouldPack = sources.length > 1 || packFiles;

      // Calculate destination name
      const finalName = this._calculateDestinationName(sources, shouldPack, folderName, suffix, version);
      const dst = path.join(outputDir, finalName);

      console.log('FileOperations: Calculated destination:', dst);

      // Check for existing backup
      try {
        await fs.access(dst);
        if (!force) {
          throw new Error(`A backup with version '${version}' already exists at: ${dst}`);
        }
        console.log('FileOperations: Will overwrite existing backup');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        console.log('FileOperations: No existing backup found');
      }

      // Create temp directory
      const tempDir = path.join(outputDir, `._tmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      this.tempFiles.add(tempDir);

      try {
        await fs.mkdir(tempDir, { recursive: true });
        console.log('FileOperations: Created temp directory:', tempDir);

        if (shouldPack) {
          // Handle packed backup (multiple sources or forced packing)
          await this._createPackedBackup(sources, tempDir, dst, force, onProgress, deselected);
        } else {
          // Handle single source backup
          await this._createSingleBackup(sources[0], tempDir, dst, force, onProgress, deselected);
        }

        console.log('FileOperations: Backup created successfully at:', dst);
        return { success: true, destination: dst };

      } finally {
        // Cleanup temp directory
        try {
          await this._cleanupTemp(tempDir);
        } catch (cleanupError) {
          console.warn('FileOperations: Failed to cleanup temp directory:', cleanupError);
        }
      }

    } catch (error) {
      console.error('FileOperations: Backup creation failed:', error);
      throw error;
    }
  }

  /**
   * Send files to sending directory
   */
  async sendFiles(options) {
    const { sources, sendingDir, onProgress = null, deselected = [] } = options;

    console.log('FileOperations: Sending files', {
      sources: sources.length,
      sendingDir,
      deselectedCount: deselected.length
    });

    if (!sources || sources.length === 0) {
      throw new Error('No sources selected');
    }
    if (!sendingDir) {
      throw new Error('No sending directory configured');
    }

    // Validate sending directory
    try {
      await fs.access(sendingDir);
    } catch (error) {
      throw new Error(`Sending directory does not exist: ${sendingDir}`);
    }

    const results = { successCount: 0, errorCount: 0, errors: [] };

    for (const sourcePath of sources) {
      try {
        // Validate source exists
        await fs.access(sourcePath);

        const itemName = path.basename(sourcePath);
        const destPath = path.join(sendingDir, itemName);

        // Check for overwrite
        try {
          await fs.access(destPath);
          // File exists - this would have been handled in UI with confirmation
          console.log('FileOperations: Overwriting existing file:', destPath);
        } catch (error) {
          // File doesn't exist, proceed
        }

        // Copy with deselected item filtering
        await this._copyItemRecursiveFiltered(sourcePath, destPath, onProgress, deselected);
        results.successCount++;
        console.log('FileOperations: Successfully sent:', sourcePath, '->', destPath);

      } catch (error) {
        results.errorCount++;
        results.errors.push(`Failed to send ${sourcePath}: ${error.message}`);
        console.error('FileOperations: Send failed:', error);
      }
    }

    return results;
  }

  /**
   * Calculate destination name (replicates PowerShell logic)
   */
  _calculateDestinationName(sources, shouldPack, folderName, suffix, version) {
    if (shouldPack) {
      if (!folderName || folderName.trim() === '') {
        throw new Error('Folder name is required when packing files');
      }
      return `${folderName}${suffix}${version}`;
    } else {
      // Single file - insert suffix before extension
      const srcLeaf = path.basename(sources[0]);
      const namePart = path.parse(srcLeaf).name;
      const extension = path.parse(srcLeaf).ext;
      return `${namePart}${suffix}${version}${extension}`;
    }
  }

  /**
   * Create packed backup (multiple sources)
   */
  async _createPackedBackup(sources, tempDir, finalDst, force, onProgress, deselected = []) {
    console.log('FileOperations: Creating packed backup');

    // Calculate source hashes BEFORE copying
    console.log('FileOperations: Calculating source hashes for verification...');
    const sourceHashes = await this._calculateSourceHashes(sources, true, deselected);
    console.log(`FileOperations: Calculated hashes for ${sourceHashes.size} files`);

    // Handle existing destination if forcing overwrite
    if (force) {
      try {
        await fs.access(finalDst);
        await this._removeRecursive(finalDst);
        console.log('FileOperations: Removed existing packed backup');
      } catch (error) {
        // Destination doesn't exist, continue
      }
    }

    // Copy all sources to temp directory
    for (const source of sources) {
      const srcLeaf = path.basename(source);
      const destPath = path.join(tempDir, srcLeaf);

      await this._copyItemRecursive(source, destPath, onProgress);
      console.log('FileOperations: Copied source to temp:', source, '->', destPath);
    }

    // Remove deselected items from temp directory
    if (deselected && deselected.length > 0) {
      for (const deselectedPath of deselected) {
        for (const source of sources) {
          if (deselectedPath.startsWith(source + path.sep) || deselectedPath === source) {
            const relativePath = path.relative(source, deselectedPath);
            const srcLeaf = path.basename(source);
            const fullPath = path.join(tempDir, srcLeaf, relativePath);
            try {
              await fs.access(fullPath);
              await this._removeRecursive(fullPath);
              console.log('FileOperations: Removed deselected item:', fullPath);
            } catch (error) {
              // Not found or already removed
            }
          }
        }
      }
    }

    // Hash-based verification
    console.log('FileOperations: Verifying packed backup with hashes...');
    const verification = await this._verifyHashesAgainstSources(sourceHashes, tempDir, true);
    if (!verification.valid) {
      throw new Error(`Hash verification failed: ${verification.message}`);
    }
    console.log('FileOperations: Hash verification passed for packed backup');

    // Move temp to final destination
    await this._moveTempToFinal(tempDir, finalDst);
    console.log('FileOperations: Moved packed backup to final destination');
  }

  /**
   * Create single source backup
   */
  async _createSingleBackup(source, tempDir, finalDst, force, onProgress, deselected = []) {
    console.log('FileOperations: Creating single backup');

    // Calculate source hashes BEFORE copying
    console.log('FileOperations: Calculating source hashes for verification...');
    const sourceHashes = await this._calculateSourceHashes([source], false, deselected);
    console.log(`FileOperations: Calculated hashes for ${sourceHashes.size} files`);

    // Handle existing destination if forcing overwrite
    if (force) {
      try {
        await fs.access(finalDst);
        const stat = await fs.stat(finalDst);
        if (stat.isDirectory()) {
          await this._removeRecursive(finalDst);
        } else {
          await fs.unlink(finalDst);
        }
        console.log('FileOperations: Removed existing single backup');
      } catch (error) {
        // Destination doesn't exist, continue
      }
    }

    // Copy directly to final destination
    await this._copyItemRecursive(source, finalDst, onProgress);

    // Remove deselected items from destination (for directory backups)
    const destStat = await fs.stat(finalDst);
    if (destStat.isDirectory() && deselected && deselected.length > 0) {
      for (const deselectedPath of deselected) {
        if (deselectedPath.startsWith(source + path.sep) || deselectedPath === source) {
          const relativePath = path.relative(source, deselectedPath);
          const fullPath = path.join(finalDst, relativePath);
          try {
            await fs.access(fullPath);
            await this._removeRecursive(fullPath);
            console.log('FileOperations: Removed deselected item:', fullPath);
          } catch (error) {
            // Not found or already removed
          }
        }
      }
    }

    // Hash-based verification
    console.log('FileOperations: Verifying single backup with hashes...');
    const verification = await this._verifyHashesAgainstSources(sourceHashes, finalDst, false);
    if (!verification.valid) {
      throw new Error(`Hash verification failed: ${verification.message}`);
    }
    console.log('FileOperations: Hash verification passed for single backup');
  }

  /**
   * Recursively copy files and directories with streaming
   */
  async _copyItemRecursive(source, destination, onProgress) {
    const stat = await fs.stat(source);

    if (stat.isDirectory()) {
      await fs.mkdir(destination, { recursive: true });

      const entries = await fs.readdir(source);
      for (const entry of entries) {
        const srcPath = path.join(source, entry);
        const destPath = path.join(destination, entry);
        await this._copyItemRecursive(srcPath, destPath, onProgress);
      }
    } else {
      // File copy with streaming
      await this._copyFileStream(source, destination, onProgress);
    }
  }

  /**
   * Recursively copy files and directories with deselected item filtering
   */
  async _copyItemRecursiveFiltered(source, destination, onProgress, deselected = []) {
    // Check if this item should be excluded (deselected)
    // An item should be excluded if it IS a deselected item or is INSIDE a deselected directory
    const shouldExclude = deselected.some(deselectedPath => {
      return source === deselectedPath || source.startsWith(deselectedPath + path.sep);
    });

    if (shouldExclude) {
      console.log('FileOperations: Skipping deselected item during send:', source);
      return;
    }

    const stat = await fs.stat(source);

    if (stat.isDirectory()) {
      await fs.mkdir(destination, { recursive: true });

      const entries = await fs.readdir(source);
      for (const entry of entries) {
        const srcPath = path.join(source, entry);
        const destPath = path.join(destination, entry);
        await this._copyItemRecursiveFiltered(srcPath, destPath, onProgress, deselected);
      }
    } else {
      // File copy with streaming
      await this._copyFileStream(source, destination, onProgress);
    }
  }

  /**
   * Stream-based file copying for reliability
   */
  async _copyFileStream(source, destination, onProgress) {
    return this._retryOperation(async () => {
      return new Promise((resolve, reject) => {
        const readStream = createReadStream(source);
        const writeStream = createWriteStream(destination);

        let bytesCopied = 0;
        const totalBytes = fsSync.statSync(source).size;

        readStream.on('data', (chunk) => {
          bytesCopied += chunk.length;
          if (onProgress) {
            onProgress({
              type: 'file_progress',
              source,
              destination,
              bytesCopied,
              totalBytes,
              percentage: (bytesCopied / totalBytes) * 100
            });
          }
        });

        readStream.on('error', reject);
        writeStream.on('error', reject);

        writeStream.on('finish', async () => {
          try {
            // Verify file size
            const destStat = await fs.stat(destination);
            if (destStat.size !== totalBytes) {
              throw new Error(`File size mismatch: expected ${totalBytes}, got ${destStat.size}`);
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        readStream.pipe(writeStream);
      });
    });
  }

  /**
   * Verify packed backup
   */
  async _verifyPackedBackup(sources, tempDir) {
    try {
      // Count expected files and bytes from all sources (files or directories)
      let expectedFiles = 0;
      let expectedBytes = 0;

      for (const source of sources) {
        const counts = await this._countSourceFiles(source);
        expectedFiles += counts.files;
        expectedBytes += counts.bytes;
      }

      // Count actual files and bytes in temp
      const actual = await this._countFilesRecursive(tempDir);

      // Allow small tolerance for file system differences
      const fileTolerance = 5;
      const byteTolerance = 1024;

      const fileDiff = Math.abs(expectedFiles - actual.files);
      const byteDiff = Math.abs(expectedBytes - actual.bytes);

      if (fileDiff > fileTolerance || byteDiff > byteTolerance) {
        return {
          valid: false,
          message: `Verification failed: expected ${expectedFiles} files (${expectedBytes} bytes), got ${actual.files} files (${actual.bytes} bytes)`
        };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, message: `Verification error: ${error.message}` };
    }
  }

  /**
   * Verify single backup
   */
  async _verifySingleBackup(source, destination) {
    try {
      const srcStat = await fs.stat(source);
      const dstStat = await fs.stat(destination);

      if (srcStat.isDirectory()) {
        // Directory verification - both source and destination should be directories
        const srcCounts = await this._countFilesRecursive(source);
        const dstCounts = await this._countFilesRecursive(destination);

        if (srcCounts.files !== dstCounts.files || srcCounts.bytes !== dstCounts.bytes) {
          return {
            valid: false,
            message: `Directory verification failed: source (${srcCounts.files} files, ${srcCounts.bytes} bytes) != destination (${dstCounts.files} files, ${dstCounts.bytes} bytes)`
          };
        }
      } else {
        // File verification - both source and destination should be files
        if (srcStat.size !== dstStat.size) {
          return {
            valid: false,
            message: `File size verification failed: source ${srcStat.size} bytes != destination ${dstStat.size} bytes`
          };
        }

        // Additional check: ensure destination is also a file (not a directory)
        if (dstStat.isDirectory()) {
          return {
            valid: false,
            message: `File verification failed: expected destination to be a file, but found directory`
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, message: `Verification error: ${error.message}` };
    }
  }

  /**
   * Count files and bytes for a source (can be file or directory)
   */
  async _countSourceFiles(sourcePath) {
    const stat = await fs.stat(sourcePath);

    if (stat.isDirectory()) {
      // Count all files in directory recursively
      return await this._countFilesRecursive(sourcePath);
    } else {
      // Single file - count as 1 file with its size
      return { files: 1, bytes: stat.size };
    }
  }

  /**
   * Count files and bytes recursively (assumes input is a directory)
   */
  async _countFilesRecursive(dirPath) {
    let files = 0;
    let bytes = 0;

    async function count(dir) {
      const entries = await fs.readdir(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
          await count(fullPath);
        } else {
          files++;
          bytes += stat.size;
        }
      }
    }

    await count(dirPath);
    return { files, bytes };
  }

  /**
   * Remove directory recursively
   */
  async _removeRecursive(dirPath) {
    const stat = await fs.stat(dirPath);

    if (stat.isDirectory()) {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        await this._removeRecursive(fullPath);
      }
      await fs.rmdir(dirPath);
    } else {
      await fs.unlink(dirPath);
    }
  }

  /**
   * Move temp directory to final destination
   */
  async _moveTempToFinal(tempDir, finalDst) {
    try {
      await fs.rename(tempDir, finalDst);
    } catch (error) {
      // Rename failed (probably cross-device), try copy + delete
      console.log('FileOperations: Rename failed, falling back to copy+delete');
      await this._copyItemRecursive(tempDir, finalDst);
      await this._removeRecursive(tempDir);
    }
  }

  /**
   * Cleanup temporary files
   */
  async _cleanupTemp(tempDir) {
    try {
      // Check if temp directory still exists (it might have been renamed successfully)
      await fs.access(tempDir);
      await this._removeRecursive(tempDir);
      this.tempFiles.delete(tempDir);
    } catch (error) {
      // ENOENT means directory was successfully moved/renamed - this is expected
      if (error.code === 'ENOENT') {
        this.tempFiles.delete(tempDir);
        console.log('FileOperations: Temp directory was successfully moved, no cleanup needed');
      } else {
        console.warn('FileOperations: Temp cleanup failed:', error);
      }
    }
  }

  /**
   * Calculate SHA-256 hash for a file using streaming
   */
  async _calculateFileHash(filePath) {
    return this._retryOperation(async () => {
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filePath);

        stream.on('data', (chunk) => {
          hash.update(chunk);
        });

        stream.on('end', () => {
          resolve(hash.digest('hex'));
        });

        stream.on('error', (error) => {
          reject(new Error(`Failed to hash file ${filePath}: ${error.message}`));
        });
      });
    });
  }

  /**
   * Calculate hashes for all files in a directory recursively
   */
  async _calculateDirectoryHashes(dirPath, basePath = dirPath, deselected = []) {
    const hashes = new Map();

    const hashRecursive = async (currentPath, relativeBase) => {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(relativeBase, fullPath);

        // Check if this path should be excluded (deselected)
        const shouldExclude = deselected.some(deselectedPath => {
          if (deselectedPath === fullPath || deselectedPath.startsWith(fullPath + path.sep)) {
            return true;
          }
          return false;
        });

        if (shouldExclude) {
          console.log(`FileOperations: Excluding deselected item: ${fullPath}`);
          continue;
        }

        try {
          if (entry.isDirectory()) {
            await hashRecursive(fullPath, relativeBase);
          } else if (entry.isFile()) {
            const fileHash = await this._calculateFileHash(fullPath);
            hashes.set(relativePath, fileHash);
          }
          // Skip symlinks and other file types for now
        } catch (error) {
          console.warn(`FileOperations: Skipping ${fullPath} during hash calculation: ${error.message}`);
          // Continue with other files rather than failing completely
        }
      }
    };

    await hashRecursive(dirPath, basePath);
    return hashes;
  }

  /**
   * Calculate hashes for sources (files or directories)
   */
  async _calculateSourceHashes(sources, isPacked = false, deselected = []) {
    const sourceHashes = new Map();

    for (const source of sources) {
      try {
        const stat = await fs.stat(source);

        if (stat.isDirectory()) {
          // For directories, store hashes with relative paths
          // For packed backups, include the source directory name as prefix to match copied structure
          // For single backups, use relative paths only (not including directory name)
          const dirHashes = await this._calculateDirectoryHashes(source, source, deselected);
          for (const [relativePath, hash] of dirHashes) {
            const key = isPacked ? path.join(path.basename(source), relativePath) : relativePath;
            sourceHashes.set(key, hash);
          }
        } else if (stat.isFile()) {
          const fileHash = await this._calculateFileHash(source);
          sourceHashes.set(path.basename(source), fileHash);
        }
      } catch (error) {
        throw new Error(`Failed to calculate hash for source ${source}: ${error.message}`);
      }
    }

    return sourceHashes;
  }

  /**
   * Verify destination files against source hashes
   */
  async _verifyHashesAgainstSources(sourceHashes, destination, isPacked) {
    let destHashes = new Map();

    try {
      const destStat = await fs.stat(destination);

      if (isPacked || destStat.isDirectory()) {
        // For packed backups OR when destination is a directory (single directory backup)
        // Use relative paths only (same as source) for comparison
        destHashes = await this._calculateDirectoryHashes(destination);
      } else {
        // For true single file backups (destination is a file)
        const fileHash = await this._calculateFileHash(destination);
        // For single files, the sourceHashes has the original filename as key
        // We need to find the corresponding source hash
        const sourceKeys = Array.from(sourceHashes.keys());
        if (sourceKeys.length === 1) {
          destHashes.set(sourceKeys[0], fileHash);
        }
      }

      // Compare all hashes
      const mismatchedFiles = [];
      const missingFiles = [];
      const extraFiles = [];

      // Check that all source files are present in destination with matching hashes
      for (const [sourcePath, sourceHash] of sourceHashes) {
        const destHash = destHashes.get(sourcePath);
        if (!destHash) {
          missingFiles.push(sourcePath);
        } else if (destHash !== sourceHash) {
          mismatchedFiles.push(sourcePath);
        }
      }

      // Check for extra files in destination (shouldn't happen in backups)
      for (const destPath of destHashes.keys()) {
        if (!sourceHashes.has(destPath)) {
          extraFiles.push(destPath);
        }
      }

      if (missingFiles.length > 0 || mismatchedFiles.length > 0 || extraFiles.length > 0) {
        let message = 'Hash verification failed:';
        if (mismatchedFiles.length > 0) {
          message += ` ${mismatchedFiles.length} files corrupted (${mismatchedFiles.slice(0, 3).join(', ')}${mismatchedFiles.length > 3 ? '...' : ''});`;
        }
        if (missingFiles.length > 0) {
          message += ` ${missingFiles.length} files missing (${missingFiles.slice(0, 3).join(', ')}${missingFiles.length > 3 ? '...' : ''});`;
        }
        if (extraFiles.length > 0) {
          message += ` ${extraFiles.length} unexpected files (${extraFiles.slice(0, 3).join(', ')}${extraFiles.length > 3 ? '...' : ''});`;
        }
        return { valid: false, message: message.trim() };
      }

      return { valid: true };

    } catch (error) {
      return { valid: false, message: `Hash verification error: ${error.message}` };
    }
  }

  /**
   * Count items in directory for selection summary
   */
  async countItemsInDirectory(dirPath) {
    try {
      let count = 0;

      async function countRecursive(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          count++;
          if (entry.isDirectory()) {
            await countRecursive(path.join(dir, entry.name));
          }
        }
      }

      await countRecursive(dirPath);
      return count;
    } catch (error) {
      return 0;
    }
  }
}

module.exports = FileOperations;
