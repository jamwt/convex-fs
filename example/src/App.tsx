import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react";
import { buildDownloadUrl } from "convex-fs";
import { api } from "../convex/_generated/api";
import {
  FolderInput,
  Copy,
  Trash2,
  X,
  ImagePlus,
  Image,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import "./App.css";

// Path prefix for ConvexFS routes (must match http.ts)
const FS_PREFIX = "/fs";

// Types
type UploadingFile = {
  id: string;
  name: string;
  progress: number;
};

type Toast = {
  id: string;
  message: string;
  type: "error" | "success";
};

type MoveModalState = {
  image: { path: string; blobId: string };
  newPath: string;
} | null;

type CopyModalState = {
  image: { path: string; blobId: string };
  newPath: string;
} | null;

type DeleteModalState = {
  image: { path: string; blobId: string };
} | null;

function App() {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [moveModal, setMoveModal] = useState<MoveModalState>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [copyModal, setCopyModal] = useState<CopyModalState>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const commitImage = useMutation(api.files.commitImage);
  const moveFile = useMutation(api.files.moveFile);
  const copyFile = useMutation(api.files.copyFile);
  const deleteFile = useMutation(api.files.deleteFile);

  const {
    results: images,
    status,
    loadMore,
  } = usePaginatedQuery(api.files.listImages, {}, { initialNumItems: 24 });

  // Get site URL for uploads and image URLs
  const envUrl = import.meta.env.VITE_CONVEX_URL ?? "";
  const siteUrl = envUrl.endsWith(".cloud")
    ? envUrl.replace(/\.cloud$/, ".site")
    : envUrl;

  // Add a toast message
  const addToast = useCallback(
    (message: string, type: "error" | "success" = "error") => {
      const id = Math.random().toString(36).substring(7);
      setToasts((prev) => [...prev, { id, message, type }]);
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    [],
  );

  // Handle move file
  const handleMove = useCallback(async () => {
    if (!moveModal) return;

    // NOOP if path unchanged
    if (moveModal.newPath === moveModal.image.path) {
      setMoveModal(null);
      return;
    }

    setIsMoving(true);
    try {
      await moveFile({
        sourcePath: moveModal.image.path,
        destPath: moveModal.newPath,
      });
      addToast(`Moved to ${moveModal.newPath}`, "success");
      setMoveModal(null);
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Move failed");
    } finally {
      setIsMoving(false);
    }
  }, [moveModal, moveFile, addToast]);

  // Handle copy file
  const handleCopy = useCallback(async () => {
    if (!copyModal) return;

    // NOOP if path unchanged
    if (copyModal.newPath === copyModal.image.path) {
      setCopyModal(null);
      return;
    }

    setIsCopying(true);
    try {
      await copyFile({
        sourcePath: copyModal.image.path,
        destPath: copyModal.newPath,
      });
      addToast(`Copied to ${copyModal.newPath}`, "success");
      setCopyModal(null);
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Copy failed");
    } finally {
      setIsCopying(false);
    }
  }, [copyModal, copyFile, addToast]);

  // Handle delete file
  const handleDelete = useCallback(async () => {
    if (!deleteModal) return;

    setIsDeleting(true);
    try {
      await deleteFile({ path: deleteModal.image.path });
      addToast(`Deleted ${deleteModal.image.path}`, "success");
      setDeleteModal(null);
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteModal, deleteFile, addToast]);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && moveModal && !isMoving) {
        setMoveModal(null);
      }
      if (e.key === "Escape" && copyModal && !isCopying) {
        setCopyModal(null);
      }
      if (e.key === "Escape" && deleteModal && !isDeleting) {
        setDeleteModal(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveModal, isMoving, copyModal, isCopying, deleteModal, isDeleting]);

  // Handle file upload
  const uploadFiles = useCallback(
    async (files: FileList) => {
      const validFiles: File[] = [];

      // Validate files are images
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          addToast(`"${file.name}" is not an image file`);
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) return;

      // Add files to uploading state
      const uploadStates: UploadingFile[] = validFiles.map((file) => ({
        id: Math.random().toString(36).substring(7),
        name: file.name,
        progress: 0,
      }));

      setUploading((prev) => [...prev, ...uploadStates]);

      // Upload each file
      await Promise.all(
        validFiles.map(async (file, index) => {
          const uploadState = uploadStates[index];

          try {
            // 1. Upload file to proxy endpoint with progress tracking
            const blobId = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();

              xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                  const progress = Math.round(
                    (event.loaded / event.total) * 100,
                  );
                  setUploading((prev) =>
                    prev.map((u) =>
                      u.id === uploadState.id ? { ...u, progress } : u,
                    ),
                  );
                }
              });

              xhr.addEventListener("load", () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response.blobId);
                  } catch {
                    reject(new Error("Invalid response from upload"));
                  }
                } else {
                  reject(new Error(`Upload failed: ${xhr.status}`));
                }
              });

              xhr.addEventListener("error", () => {
                reject(new Error("Upload failed"));
              });

              xhr.open("POST", `${siteUrl}/fs/upload`);
              xhr.setRequestHeader("Content-Type", file.type);
              xhr.send(file);
            });

            // 2. Commit the image to the filesystem
            await commitImage({
              blobId,
              filename: file.name,
              contentType: file.type,
            });

            // Remove from uploading state
            setUploading((prev) => prev.filter((u) => u.id !== uploadState.id));
          } catch (error) {
            // Remove from uploading state and show error
            setUploading((prev) => prev.filter((u) => u.id !== uploadState.id));
            addToast(
              `Failed to upload "${file.name}": ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }),
      );
    },
    [siteUrl, commitImage, addToast],
  );

  // Drag handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    },
    [uploadFiles],
  );

  // Click handler for drop zone
  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // File input change handler
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFiles(e.target.files);
        // Reset input so the same file can be selected again
        e.target.value = "";
      }
    },
    [uploadFiles],
  );

  return (
    <div className="app">
      <h1>Convex FS - Photo Gallery</h1>

      {/* Drop Zone */}
      <div
        className={`drop-zone ${dragActive ? "active" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <div className="drop-zone-icon">
          <ImagePlus size={48} strokeWidth={1.5} />
        </div>
        <p className="drop-zone-text">Drop images here or click to upload</p>
        <p className="drop-zone-subtext">Supports multiple files</p>

        {/* Upload Progress */}
        {uploading.length > 0 && (
          <div className="upload-progress">
            {uploading.map((file) => (
              <div key={file.id} className="upload-item">
                <span className="upload-item-name">{file.name}</span>
                <progress value={file.progress} max={100} />
                <span className="upload-item-percent">{file.progress}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden-input"
        onChange={handleFileChange}
      />

      {/* Photo Grid */}
      {status === "LoadingFirstPage" ? (
        <div className="loading-state">Loading images...</div>
      ) : images.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Image size={64} strokeWidth={1} />
          </div>
          <p className="empty-state-text">No images yet. Upload some!</p>
        </div>
      ) : (
        <>
          <div className="photo-grid">
            {images.map((image) => (
              <div key={image.path} className="photo-grid-item">
                <img
                  src={buildDownloadUrl(
                    siteUrl,
                    FS_PREFIX,
                    image.blobId,
                    image.path,
                  )}
                  alt={image.path}
                  loading="lazy"
                />
                <div className="photo-grid-item-info">
                  <span className="photo-grid-item-filename">{image.path}</span>
                  <div className="photo-grid-item-actions">
                    <button
                      className="action-btn"
                      title="Move"
                      onClick={() =>
                        setMoveModal({ image, newPath: image.path })
                      }
                    >
                      <FolderInput size={14} />
                    </button>
                    <button
                      className="action-btn"
                      title="Copy"
                      onClick={() =>
                        setCopyModal({ image, newPath: image.path })
                      }
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      className="action-btn action-btn-danger"
                      title="Delete"
                      onClick={() => setDeleteModal({ image })}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load More Button */}
          {status === "CanLoadMore" && (
            <div className="load-more">
              <button onClick={() => loadMore(24)}>Load More</button>
            </div>
          )}

          {status === "LoadingMore" && (
            <div className="load-more">
              <button disabled>Loading...</button>
            </div>
          )}
        </>
      )}

      {/* Move Modal */}
      {moveModal && (
        <div
          className="modal-overlay"
          onClick={() => !isMoving && setMoveModal(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Move File</h2>
              <button
                className="modal-close"
                onClick={() => setMoveModal(null)}
                disabled={isMoving}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <label className="modal-label">New path</label>
              <input
                type="text"
                className="modal-input"
                value={moveModal.newPath}
                onChange={(e) =>
                  setMoveModal({ ...moveModal, newPath: e.target.value })
                }
                disabled={isMoving}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isMoving) {
                    handleMove();
                  }
                }}
              />
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn modal-btn-secondary"
                onClick={() => setMoveModal(null)}
                disabled={isMoving}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handleMove}
                disabled={isMoving}
              >
                {isMoving ? "Moving..." : "Move"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Modal */}
      {copyModal && (
        <div
          className="modal-overlay"
          onClick={() => !isCopying && setCopyModal(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Copy File</h2>
              <button
                className="modal-close"
                onClick={() => setCopyModal(null)}
                disabled={isCopying}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <label className="modal-label">New path</label>
              <input
                type="text"
                className="modal-input"
                value={copyModal.newPath}
                onChange={(e) =>
                  setCopyModal({ ...copyModal, newPath: e.target.value })
                }
                disabled={isCopying}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCopying) {
                    handleCopy();
                  }
                }}
              />
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn modal-btn-secondary"
                onClick={() => setCopyModal(null)}
                disabled={isCopying}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-primary"
                onClick={handleCopy}
                disabled={isCopying}
              >
                {isCopying ? "Copying..." : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div
          className="modal-overlay"
          onClick={() => !isDeleting && setDeleteModal(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete File</h2>
              <button
                className="modal-close"
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-text">
                Are you sure you want to delete{" "}
                <strong>{deleteModal.image.path}</strong>? This action cannot be
                undone.
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn modal-btn-secondary"
                onClick={() => setDeleteModal(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="modal-btn modal-btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              {toast.type === "success" ? (
                <CheckCircle size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
