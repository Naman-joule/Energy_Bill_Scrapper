import React from 'react';
import type { DragEvent, ChangeEvent, RefObject } from 'react';
import { CloudUpload, FileText, X, Cpu, Upload } from 'lucide-react';

interface DropZoneProps {
  selectedFile: File | null;
  dragActive: boolean;
  loading: boolean;
  triggerFileSelect: () => void;
  handleDrag: (e: DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: DragEvent<HTMLDivElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: () => void;
  runAnalysis: () => void;
  csvInputRef: RefObject<HTMLInputElement | null>;
  importFromCSV: (e: ChangeEvent<HTMLInputElement>) => void;
}

export const DropZone: React.FC<DropZoneProps> = ({
  selectedFile,
  dragActive,
  loading,
  triggerFileSelect,
  handleDrag,
  handleDrop,
  fileInputRef,
  handleFileChange,
  handleRemoveFile,
  runAnalysis,
  csvInputRef,
  importFromCSV,
}) => {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, textAlign: 'left' }}>Document Source</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '-0.75rem', textAlign: 'left' }}>
        Upload your utility statement. Supported formats include scanned PDFs, JPEGs, and PNGs.
      </p>

      {/* Upload Dropzone */}
      {!selectedFile ? (
        <div 
          className={`upload-zone ${dragActive ? 'dragover' : ''}`}
          onClick={triggerFileSelect}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <CloudUpload className="upload-icon" />
          <h3 className="upload-title">Drag & drop bill here</h3>
          <p className="upload-subtitle">or browse files from your disk</p>
          <button type="button" className="file-select-btn" onClick={(e) => { e.stopPropagation(); triggerFileSelect(); }}>
            Select File
          </button>
          <input 
            ref={fileInputRef}
            type="file" 
            style={{ display: 'none' }} 
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            onChange={handleFileChange}
          />
        </div>
      ) : (
        /* Selected File Panel */
        <div className="file-status-card">
          <FileText className="file-icon" />
          <div className="file-info">
            <div className="file-name">{selectedFile.name}</div>
            <div className="file-meta">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type.split('/')[1]?.toUpperCase() || 'FILE'}
            </div>
          </div>
          <button className="btn-remove-file" onClick={handleRemoveFile} aria-label="Remove uploaded file">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Submit button */}
      <button 
        className="btn-analyze" 
        disabled={!selectedFile || loading}
        onClick={runAnalysis}
      >
        <Cpu size={20} />
        Analyze Energy Bill
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>or</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
      </div>
      
      <button 
        className="btn-analyze" 
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={() => csvInputRef.current?.click()}
      >
        <Upload size={20} />
        Import from CSV
      </button>
      <input 
        ref={csvInputRef}
        type="file" 
        style={{ display: 'none' }} 
        accept=".csv"
        onChange={importFromCSV}
      />
    </div>
  );
};

export default DropZone;
