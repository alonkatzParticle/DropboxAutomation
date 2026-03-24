"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, ChevronRight, ExternalLink, Folder, RefreshCw } from "lucide-react";

interface VerificationResult {
  success: boolean;
  taskName?: string;
  previewPath?: string;
  boardId?: string;
  itemId?: string;
  error?: string;
  dropboxLink?: string;
  isConfirmation?: boolean;
  hasExistingFolder?: boolean;  // True if the task already has a Dropbox link
  existingLink?: string;        // The existing Dropbox URL if one exists
}

export default function LinkVerifier() {
  const [urlInput, setUrlInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [creating, setCreating] = useState(false);

  // Parse Monday.com URL to extract boardId and itemId
  const parseUrl = (url: string): { boardId: string; itemId: string } | null => {
    const match = url.match(/\/boards\/(\d+)\/pulses\/(\d+)/);
    if (!match) return null;
    return { boardId: match[1], itemId: match[2] };
  };

  // Verify the link by calling the API
  const handleVerify = async () => {
    const parsed = parseUrl(urlInput);
    if (!parsed) {
      setVerificationResult({
        success: false,
        error: "Invalid Monday.com URL format. Expected: https://...monday.com/boards/{id}/pulses/{id}",
      });
      return;
    }

    setVerifying(true);
    setVerificationResult(null);

    try {
      const response = await fetch(
        `/api/verify-link?boardId=${parsed.boardId}&itemId=${parsed.itemId}`
      );
      const data = await response.json();
      setVerificationResult(data);
    } catch (error) {
      setVerificationResult({
        success: false,
        error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setVerifying(false);
    }
  };

  // Extract Dropbox link from Python output
  const extractDropboxLink = (output: string): string | null => {
    const match = output.match(/Link:\s*(https:\/\/[^\s]+)/);
    return match ? match[1] : null;
  };

  // Create (or replace) the folder. force=true overwrites an existing Dropbox link.
  const handleCreate = async (force = false) => {
    if (!verificationResult?.success || !verificationResult?.boardId || !verificationResult?.itemId) {
      return;
    }

    setCreating(true);

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "selected",
          force,
          items: [{ boardId: verificationResult.boardId, itemId: verificationResult.itemId }],
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Extract Dropbox link from the output
        console.log("API output:", data.output);
        const dropboxLink = extractDropboxLink(data.output);
        console.log("Extracted link:", dropboxLink);

        if (dropboxLink) {
          // Success: show confirmation message with link
          setVerificationResult({
            success: true,
            taskName: verificationResult.taskName,
            previewPath: verificationResult.previewPath,
            boardId: verificationResult.boardId,
            itemId: verificationResult.itemId,
            dropboxLink,
            isConfirmation: true,
          });
        } else {
          setVerificationResult({
            success: false,
            error: `Folder created but could not extract Dropbox link from response. Output: ${data.output.substring(0, 200)}`,
          });
        }
      } else {
        setVerificationResult({
          success: false,
          error: data.error || "Failed to create folder",
        });
      }
    } catch (error) {
      setVerificationResult({
        success: false,
        error: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setCreating(false);
    }
  };

  // Cancel and reset
  const handleCancel = () => {
    setUrlInput("");
    setVerificationResult(null);
  };

  // Handle Enter key to verify
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !verifying) {
      handleVerify();
    }
  };

  return (
    <Card className="bg-blue-50 border-blue-200 p-6 mb-6">
      <h2 className="text-xl font-semibold text-blue-900 mb-4">Add Dropbox Link for Task</h2>

      <div className="space-y-4">
        {/* URL Input */}
        {!verificationResult || !verificationResult.success ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste a Monday.com task URL (https://...monday.com/boards/.../pulses/...)"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={verifying}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
            <Button
              onClick={handleVerify}
              disabled={verifying || !urlInput.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify"
              )}
            </Button>
          </div>
        ) : null}

        {/* Loading State */}
        {verifying && (
          <div className="flex items-center gap-2 text-blue-600 py-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Checking task and computing folder path...</span>
          </div>
        )}

        {/* Error State */}
        {verificationResult && !verificationResult.success && (
          <Alert className="bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">
              {verificationResult.error || "Unknown error"}
            </AlertDescription>
          </Alert>
        )}

        {/* Success State - Show Folder Preview or Confirmation */}
        {verificationResult?.success && !verificationResult?.isConfirmation && (
          <div className="space-y-4">

            {/* Existing folder warning */}
            {verificationResult.hasExistingFolder ? (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700">
                  This task already has a Dropbox folder linked.{" "}
                  <a href={verificationResult.existingLink} target="_blank" rel="noreferrer"
                    className="underline font-medium">Open existing folder</a>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700">
                  Task found — no existing folder. Ready to create.
                </AlertDescription>
              </Alert>
            )}

            {/* Task Details */}
            <div className="bg-white border border-blue-200 rounded-md p-4 space-y-2">
              <div>
                <p className="text-sm text-gray-600">Task Name</p>
                <p className="text-lg font-medium text-gray-900">{verificationResult.taskName}</p>
              </div>

              {/* Folder Path Preview */}
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  {verificationResult.hasExistingFolder ? "New folder path (if replaced)" : "Folder Path"}
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    {verificationResult.previewPath
                      ?.split("/")
                      .filter(Boolean)
                      .map((segment, index, arr) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 break-words">{segment}</span>
                          {index < arr.length - 1 && (
                            <span className="text-gray-400 font-light flex-shrink-0">›</span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {/* If no existing folder: Create. If folder exists: Replace (force). */}
              {verificationResult.hasExistingFolder ? (
                <Button
                  onClick={() => handleCreate(true)}
                  disabled={creating}
                  variant="outline"
                  className="border-amber-400 text-amber-700 hover:bg-amber-50"
                >
                  {creating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Replacing…</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-2" />Replace folder</>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => handleCreate(false)}
                  disabled={creating}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {creating ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
                  ) : (
                    <>Create Folder<ChevronRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
              )}
              <Button onClick={handleCancel} variant="outline" disabled={creating} className="border-gray-300">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation State - Show Success with Links */}
        {verificationResult?.success && verificationResult?.isConfirmation && (
          <div className="space-y-4">
            <Alert className="bg-emerald-50 border-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-700 font-semibold">
                ✓ Folder created and link added to Monday.com!
              </AlertDescription>
            </Alert>

            {/* Confirmation Details */}
            <div className="bg-white border border-emerald-200 rounded-md p-4 space-y-3">
              <div>
                <p className="text-sm text-gray-600">Task Name</p>
                <p className="text-lg font-medium text-gray-900">{verificationResult.taskName}</p>
              </div>

              {/* Folder Path */}
              <div>
                <p className="text-sm text-gray-600 mb-2">Folder Path</p>
                <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm text-gray-700 w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    {verificationResult.previewPath
                      ?.split("/")
                      .filter(Boolean)
                      .map((segment, index, arr) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 break-words">{segment}</span>
                          {index < arr.length - 1 && (
                            <span className="text-gray-400 font-light flex-shrink-0">›</span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Dropbox Link */}
              {verificationResult.dropboxLink && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Dropbox Folder</p>
                  <a
                    href={verificationResult.dropboxLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 text-blue-700 font-medium text-sm"
                  >
                    <Folder className="w-4 h-4" />
                    Open in Dropbox
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}

              {/* Monday.com Link */}
              {verificationResult.boardId && verificationResult.itemId && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Monday.com Task</p>
                  <a
                    href={`https://particle-for-men.monday.com/boards/${verificationResult.boardId}/pulses/${verificationResult.itemId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 text-purple-700 font-medium text-sm"
                  >
                    View Task
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>

            {/* Action Button */}
            <div>
              <Button
                onClick={handleCancel}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                Create Another Folder
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
