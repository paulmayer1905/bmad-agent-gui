/**
 * File Processor - Extracts text content from uploaded files for LLM context.
 * Supports: text, images (base64), PDF (via pdf-parse), Office docs (via mammoth).
 */

const fs = require('fs').promises;
const path = require('path');

// Supported extensions grouped by type
const FILE_TYPES = {
  text: ['.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.xml', '.html', '.htm',
         '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h',
         '.go', '.rs', '.rb', '.php', '.sh', '.bat', '.ps1', '.sql', '.log',
         '.env', '.ini', '.toml', '.cfg', '.conf', '.properties', '.gitignore',
         '.dockerfile', '.makefile', '.gradle', '.r', '.swift', '.kt', '.scala',
         '.lua', '.pl', '.ex', '.exs', '.clj', '.hs', '.erl', '.dart', '.vue',
         '.svelte', '.astro'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'],
  pdf: ['.pdf'],
  docx: ['.docx'],
  // These are recognized but not deeply parsed - we'll note them
  office: ['.xlsx', '.xls', '.pptx', '.ppt', '.odt', '.ods', '.odp'],
  archive: ['.zip', '.tar', '.gz', '.rar', '.7z'],
};

// All allowed extensions
const ALL_EXTENSIONS = Object.values(FILE_TYPES).flat();

// Max file size: 10 MB for text, 20 MB for images
const MAX_TEXT_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

function getFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  for (const [type, exts] of Object.entries(FILE_TYPES)) {
    if (exts.includes(ext)) return type;
  }
  return null;
}

function getExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function getMimeType(filePath) {
  const ext = getExtension(filePath);
  const mimes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };
  return mimes[ext] || 'application/octet-stream';
}

/**
 * Process a file and return structured content for LLM consumption.
 * @param {string} filePath - Absolute path to the file
 * @returns {Object} { fileName, fileType, mimeType, textContent, base64Data, size, error }
 */
async function processFile(filePath) {
  const fileName = path.basename(filePath);
  const ext = getExtension(filePath);
  const fileType = getFileType(filePath);

  if (!fileType) {
    return {
      fileName,
      fileType: 'unsupported',
      error: `Extension "${ext}" non supportée. Extensions acceptées : ${ALL_EXTENSIONS.join(', ')}`
    };
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (err) {
    return { fileName, fileType, error: `Fichier introuvable : ${err.message}` };
  }

  const size = stat.size;

  // ─── Text files ─────────────────────────────────────────────────────
  if (fileType === 'text') {
    if (size > MAX_TEXT_SIZE) {
      return { fileName, fileType, size, error: `Fichier trop volumineux (${(size / 1024 / 1024).toFixed(1)} MB, max 10 MB)` };
    }
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return {
        fileName,
        fileType: 'text',
        mimeType: 'text/plain',
        textContent: content,
        size,
        lineCount: content.split('\n').length,
      };
    } catch (err) {
      // Try as binary/latin1 fallback
      try {
        const content = await fs.readFile(filePath, 'latin1');
        return {
          fileName,
          fileType: 'text',
          mimeType: 'text/plain',
          textContent: content,
          size,
          lineCount: content.split('\n').length,
          note: 'Encodage non-UTF8, conversion approximative',
        };
      } catch {
        return { fileName, fileType, size, error: `Impossible de lire le fichier : ${err.message}` };
      }
    }
  }

  // ─── Images ─────────────────────────────────────────────────────────
  if (fileType === 'image') {
    if (size > MAX_IMAGE_SIZE) {
      return { fileName, fileType, size, error: `Image trop volumineuse (${(size / 1024 / 1024).toFixed(1)} MB, max 20 MB)` };
    }
    try {
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');
      const mimeType = getMimeType(filePath);
      return {
        fileName,
        fileType: 'image',
        mimeType,
        base64Data: base64,
        dataUri: `data:${mimeType};base64,${base64}`,
        size,
        // Also provide text description for non-vision models
        textContent: `[Image uploadée : ${fileName} (${mimeType}, ${(size / 1024).toFixed(0)} KB)]`,
      };
    } catch (err) {
      return { fileName, fileType, size, error: `Impossible de lire l'image : ${err.message}` };
    }
  }

  // ─── PDF ────────────────────────────────────────────────────────────
  if (fileType === 'pdf') {
    if (size > MAX_TEXT_SIZE) {
      return { fileName, fileType, size, error: `PDF trop volumineux (${(size / 1024 / 1024).toFixed(1)} MB, max 10 MB)` };
    }
    try {
      const pdfParse = require('pdf-parse');
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      return {
        fileName,
        fileType: 'pdf',
        mimeType: 'application/pdf',
        textContent: data.text,
        size,
        pageCount: data.numpages,
        lineCount: data.text.split('\n').length,
      };
    } catch (err) {
      // pdf-parse not installed or parse error
      if (err.code === 'MODULE_NOT_FOUND') {
        return {
          fileName,
          fileType: 'pdf',
          size,
          textContent: `[Document PDF : ${fileName} (${(size / 1024).toFixed(0)} KB) — le module pdf-parse n'est pas installé. Exécutez : npm install pdf-parse]`,
          note: 'Module pdf-parse non disponible, contenu non extrait',
        };
      }
      return { fileName, fileType, size, error: `Erreur lecture PDF : ${err.message}` };
    }
  }

  // ─── DOCX ───────────────────────────────────────────────────────────
  if (fileType === 'docx') {
    if (size > MAX_TEXT_SIZE) {
      return { fileName, fileType, size, error: `Document trop volumineux (${(size / 1024 / 1024).toFixed(1)} MB, max 10 MB)` };
    }
    try {
      const mammoth = require('mammoth');
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      return {
        fileName,
        fileType: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        textContent: result.value,
        size,
        lineCount: result.value.split('\n').length,
      };
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        return {
          fileName,
          fileType: 'docx',
          size,
          textContent: `[Document Word : ${fileName} (${(size / 1024).toFixed(0)} KB) — le module mammoth n'est pas installé. Exécutez : npm install mammoth]`,
          note: 'Module mammoth non disponible, contenu non extrait',
        };
      }
      return { fileName, fileType, size, error: `Erreur lecture DOCX : ${err.message}` };
    }
  }

  // ─── Other Office files ─────────────────────────────────────────────
  if (fileType === 'office') {
    return {
      fileName,
      fileType: 'office',
      size,
      textContent: `[Document Office : ${fileName} (${ext}, ${(size / 1024).toFixed(0)} KB) — l'extraction de contenu n'est pas encore supportée pour ce format. Convertissez en PDF ou texte si possible.]`,
      note: 'Format non extractible directement',
    };
  }

  // ─── Archives ───────────────────────────────────────────────────────
  if (fileType === 'archive') {
    return {
      fileName,
      fileType: 'archive',
      size,
      textContent: `[Archive : ${fileName} (${ext}, ${(size / 1024).toFixed(0)} KB) — décompressez l'archive et uploadez les fichiers individuellement.]`,
      note: 'Les archives ne peuvent pas être lues directement',
    };
  }

  return { fileName, fileType: 'unknown', error: 'Type de fichier non reconnu' };
}

/**
 * Format processed file content as LLM context message.
 */
function formatFileForLLM(processed) {
  if (processed.error) {
    return `⚠️ Erreur fichier "${processed.fileName}" : ${processed.error}`;
  }

  if (processed.fileType === 'image') {
    // Images will be handled specially by vision-capable providers
    return processed.textContent;
  }

  const header = [];
  header.push(`📎 Fichier : ${processed.fileName}`);
  if (processed.pageCount) header.push(`Pages : ${processed.pageCount}`);
  if (processed.lineCount) header.push(`Lignes : ${processed.lineCount}`);
  if (processed.size) header.push(`Taille : ${(processed.size / 1024).toFixed(0)} KB`);
  if (processed.note) header.push(`⚠️ ${processed.note}`);

  const ext = getExtension(processed.fileName);
  const lang = {
    '.js': 'javascript', '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx',
    '.py': 'python', '.java': 'java', '.go': 'go', '.rs': 'rust',
    '.html': 'html', '.css': 'css', '.json': 'json', '.yaml': 'yaml',
    '.yml': 'yaml', '.xml': 'xml', '.sql': 'sql', '.sh': 'bash',
    '.md': 'markdown', '.rb': 'ruby', '.php': 'php', '.swift': 'swift',
    '.kt': 'kotlin', '.dart': 'dart', '.vue': 'vue',
  }[ext] || '';

  return `${header.join(' | ')}\n\`\`\`${lang}\n${processed.textContent}\n\`\`\``;
}

/**
 * Get the dialog filter for Electron's showOpenDialog.
 */
function getDialogFilters() {
  return [
    {
      name: 'Tous les fichiers supportés',
      extensions: ALL_EXTENSIONS.map(e => e.slice(1)) // remove leading dot
    },
    {
      name: 'Documents texte',
      extensions: FILE_TYPES.text.map(e => e.slice(1))
    },
    {
      name: 'Images',
      extensions: FILE_TYPES.image.map(e => e.slice(1))
    },
    {
      name: 'PDF',
      extensions: ['pdf']
    },
    {
      name: 'Word (DOCX)',
      extensions: ['docx']
    },
    {
      name: 'Tous les fichiers',
      extensions: ['*']
    },
  ];
}

module.exports = {
  processFile,
  formatFileForLLM,
  getDialogFilters,
  getFileType,
  getMimeType,
  ALL_EXTENSIONS,
  FILE_TYPES,
};
