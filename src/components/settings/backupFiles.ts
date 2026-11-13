export function triggerBrowserZipDownload(
  zipBytes: Uint8Array,
  filename: string,
): void {
  const blob = new Blob([zipBytes.slice()], {
    type: "application/zip",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function canShareZipFiles(): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  try {
    const testFile = new File([new Uint8Array([80, 75, 5, 6])], "test.zip", {
      type: "application/zip",
    });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

export async function shareBrowserZipFile(
  zipBytes: Uint8Array,
  filename: string,
  titleUk: string,
): Promise<boolean> {
  if (!canShareZipFiles()) return false;
  const file = new File([zipBytes.slice()], filename, {
    type: "application/zip",
  });
  await navigator.share({
    title: titleUk,
    files: [file],
  });
  return true;
}
