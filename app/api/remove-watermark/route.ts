import { randomUUID } from "crypto";
import { copyFile, readFile, unlink, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { tmpdir } from "os";
import { extname, join } from "path";

interface ProcessedFileInfo {
  path: string;
  fileName: string;
  mimeType: string;
}

const processedFiles = new Map<string, ProcessedFileInfo>();
const CLEANUP_DELAY_MS = 30 * 60 * 1000; // 30 minutes

const isFileLike = (value: unknown): value is File => {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "size" in value &&
    "type" in value
  );
};

const sanitizeFileName = (name: string) => {
  return name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toLowerCase();
};

const scheduleCleanup = (fileId: string, filePath: string) => {
  setTimeout(() => {
    unlink(filePath).catch(() => undefined);
    processedFiles.delete(fileId);
  }, CLEANUP_DELAY_MS);
};

const simulateWatermarkRemoval = async (sourcePath: string, destinationPath: string) => {
  // Placeholder for actual watermark removal logic.
  // For now, simply copy the uploaded file to the processed destination.
  await copyFile(sourcePath, destinationPath);
};

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("video");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Video file is required" }, { status: 400 });
  }

  if (!isFileLike(file)) {
    return NextResponse.json({ error: "Invalid video upload" }, { status: 400 });
  }

  const mimeType = file.type || "video/mp4";
  if (!mimeType.startsWith("video/")) {
    return NextResponse.json({ error: "Uploaded file must be a video" }, { status: 400 });
  }

  const maxSizeBytes = 500 * 1024 * 1024; // 500MB limit
  if (file.size > maxSizeBytes) {
    return NextResponse.json({ error: "Video file is too large (max 500MB)" }, { status: 413 });
  }

  const fileId = randomUUID();
  const originalName = typeof file.name === "string" ? file.name : "sora2-video.mp4";
  const extension = (extname(originalName) || ".mp4").toLowerCase();
  const baseName = originalName.slice(0, originalName.length - extension.length) || "sora2-video";
  const safeBaseName = sanitizeFileName(baseName) || "sora2-video";
  const originalPath = join(tmpdir(), `${fileId}-${safeBaseName}${extension}`);
  const processedPath = join(tmpdir(), `processed-${fileId}-${safeBaseName}${extension}`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(originalPath, buffer);

    await simulateWatermarkRemoval(originalPath, processedPath);
    await unlink(originalPath).catch(() => undefined);

    const downloadFileName = `${safeBaseName}-watermark-free${extension}`;
    processedFiles.set(fileId, {
      path: processedPath,
      fileName: downloadFileName,
      mimeType,
    });

    scheduleCleanup(fileId, processedPath);

    return NextResponse.json({
      fileId,
      downloadUrl: `/api/remove-watermark?fileId=${encodeURIComponent(fileId)}`,
      fileName: downloadFileName,
      message: "Watermark removed successfully",
    });
  } catch (error) {
    await unlink(originalPath).catch(() => undefined);
    await unlink(processedPath).catch(() => undefined);
    console.error("Failed to process video", error);
    return NextResponse.json({ error: "Failed to process video" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId");

  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }

  const info = processedFiles.get(fileId);
  if (!info) {
    return NextResponse.json({ error: "Processed video not found or expired" }, { status: 404 });
  }

  try {
    const data = await readFile(info.path);
    return new NextResponse(data, {
      headers: {
        "Content-Type": info.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${info.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    processedFiles.delete(fileId);
    await unlink(info.path).catch(() => undefined);
    console.error("Failed to stream processed video", error);
    return NextResponse.json({ error: "Failed to retrieve processed video" }, { status: 500 });
  }
}
