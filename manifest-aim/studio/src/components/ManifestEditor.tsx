"use client";

import { useState } from "react";
import { Save, Play, Download, Upload, AlertCircle, CheckCircle } from "lucide-react";

const defaultManifest = `aim: "1.0"

metadata:
  name: my-project
  version: 1.0.0
  description: "My project governance manifest"
  tags: []

context:
  persona: "Developer following best practices"
  domain: software-engineering
  environment: production

governance:
  rules:
    - name: no-console-log
      description: "Prevent console.log in production code"
      category: quality
      enforcement: static
      detect:
        type: pattern
        match: "console\\\\.log\\\\("
      action: warn
      severity: warning
      message: "console.log detected in production code."

knowledge:
  - name: project-structure
    trigger: "creating new files or modules"
    priority: 100
    content: |
      ## Project Structure
      Add your project-specific guidelines here.
`;

export function ManifestEditor() {
  const [manifest, setManifest] = useState(defaultManifest);
  const [validationStatus, setValidationStatus] = useState<"valid" | "invalid" | null>(null);
  const [validationMessage, setValidationMessage] = useState("");

  const handleValidate = () => {
    // Basic YAML validation (would use actual validator in production)
    try {
      if (manifest.includes("aim:") && manifest.includes("metadata:")) {
        setValidationStatus("valid");
        setValidationMessage("Manifest is valid");
      } else {
        setValidationStatus("invalid");
        setValidationMessage("Missing required fields");
      }
    } catch (e) {
      setValidationStatus("invalid");
      setValidationMessage("Invalid YAML syntax");
    }
  };

  const handleExport = () => {
    const blob = new Blob([manifest], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aim.yaml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Manifest Editor</h2>
          {validationStatus && (
            <span className={`flex items-center gap-1 text-sm ${
              validationStatus === "valid" ? "text-green-600" : "text-red-600"
            }`}>
              {validationStatus === "valid" ? (
                <CheckCircle size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              {validationMessage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleValidate}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
          >
            <Play size={16} />
            Validate
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
          >
            <Download size={16} />
            Export
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-aim-600 hover:bg-aim-700 text-white rounded-lg text-sm transition-colors">
            <Save size={16} />
            Save
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex">
        {/* Code Editor */}
        <div className="flex-1 p-4">
          <textarea
            value={manifest}
            onChange={(e) => setManifest(e.target.value)}
            className="w-full h-full p-4 font-mono text-sm bg-gray-900 text-gray-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-aim-500"
            spellCheck={false}
          />
        </div>

        {/* Preview Panel */}
        <div className="w-80 border-l bg-white p-4 overflow-auto">
          <h3 className="font-semibold mb-4">Manifest Preview</h3>

          <div className="space-y-4 text-sm">
            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wide">Name</label>
              <p className="font-medium">my-project</p>
            </div>

            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wide">Version</label>
              <p className="font-medium">1.0.0</p>
            </div>

            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wide">Rules</label>
              <p className="font-medium">1 rule</p>
            </div>

            <div>
              <label className="text-gray-500 text-xs uppercase tracking-wide">Knowledge</label>
              <p className="font-medium">1 knowledge block</p>
            </div>
          </div>

          <hr className="my-4" />

          <h4 className="font-semibold mb-2">Quick Actions</h4>
          <div className="space-y-2">
            <button className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              + Add Rule
            </button>
            <button className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              + Add Knowledge
            </button>
            <button className="w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              + Add Transform
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
