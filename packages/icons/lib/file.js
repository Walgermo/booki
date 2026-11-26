const fallback = "document";

const formats = {
  "document-pdf": {
    extensions: "pdf",
    types: ["application/pdf", "application/x-pdf"],
  },
  "document-lines": {
    extensions: "txt text log md markdown rtf doc docx docm dot dotx dotm odt pages",
    types: [
      "text/plain",
      "text/markdown",
      "text/rtf",
      "application/rtf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
      "application/vnd.ms-word.document.macroenabled.12",
      "application/vnd.ms-word.template.macroenabled.12",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.apple.pages",
    ],
  },
  "document-table": {
    extensions: "csv tsv xls xlsx xlsm xlsb xlt xltx xltm ods numbers",
    types: [
      "text/csv",
      "application/csv",
      "text/tab-separated-values",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
      "application/vnd.ms-excel.sheet.macroenabled.12",
      "application/vnd.ms-excel.sheet.binary.macroenabled.12",
      "application/vnd.ms-excel.template.macroenabled.12",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.apple.numbers",
    ],
  },
  presentation: {
    extensions: "ppt pptx pptm pps ppsx ppsm pot potx potm odp key",
    types: [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
      "application/vnd.openxmlformats-officedocument.presentationml.template",
      "application/vnd.ms-powerpoint.presentation.macroenabled.12",
      "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
      "application/vnd.ms-powerpoint.template.macroenabled.12",
      "application/vnd.oasis.opendocument.presentation",
      "application/vnd.apple.keynote",
    ],
  },
  image: {
    extensions: "avif bmp gif heic heif ico jfif jpeg jpg png svg tif tiff webp",
    types: [],
  },
  film: {
    extensions: "avi m4v mkv mov mp4 mpeg mpg ogv webm",
    types: [],
  },
  "audio-wave": {
    extensions: "aac aif aiff flac m4a mp3 oga ogg opus wav wave",
    types: ["application/ogg"],
  },
  "document-zip": {
    extensions: "7z bz2 gz rar tar tbz tbz2 tgz xz zip",
    types: [
      "application/zip",
      "application/x-zip-compressed",
      "application/gzip",
      "application/x-gzip",
      "application/vnd.rar",
      "application/x-rar-compressed",
      "application/x-tar",
      "application/x-7z-compressed",
      "application/x-bzip2",
      "application/x-xz",
    ],
  },
  "document-code": {
    extensions: "c cpp cs css go h htm html java js json jsx php py rb rs sh sql swift toml ts tsx xml yaml yml",
    types: [
      "application/json",
      "application/ld+json",
      "application/xml",
      "text/xml",
      "application/yaml",
      "application/x-yaml",
      "text/yaml",
      "text/x-yaml",
      "text/html",
      "application/xhtml+xml",
      "text/css",
      "application/javascript",
      "text/javascript",
      "text/typescript",
      "application/sql",
      "application/toml",
    ],
  },
};

const byExtension = new Map(
  Object.entries(formats).flatMap(([icon, { extensions }]) =>
    extensions.split(" ").map((extension) => [extension, icon]),
  ),
);
const byType = new Map(Object.entries(formats).flatMap(([icon, { types }]) => types.map((type) => [type, icon])));

export const fileIconNames = Object.freeze([fallback, ...Object.keys(formats)]);

export function getFileIconName({ name, type }) {
  const basename = (name ?? "").trim().split(/[\\/]/).at(-1);
  const dot = basename.lastIndexOf(".");
  const fromName = dot > 0 ? byExtension.get(basename.slice(dot + 1).toLowerCase()) : undefined;
  if (fromName) return fromName;

  const mime = (type ?? "").split(";", 1)[0].trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "film";
  if (mime.startsWith("audio/")) return "audio-wave";
  return byType.get(mime) ?? fallback;
}
