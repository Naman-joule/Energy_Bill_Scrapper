import React from 'react';

interface BillViewerProps {
  activeTab: 'image' | 'ocr' | 'json';
  setActiveTab: (tab: 'image' | 'ocr' | 'json') => void;
  results: {
    image_data_url?: string | null;
    raw_text?: string;
  } | null;
  previewUrl: string | null;
  editableData: any;
}

export const BillViewer: React.FC<BillViewerProps> = ({
  activeTab,
  setActiveTab,
  results,
  previewUrl,
  editableData,
}) => {
  if (!results) return null;

  return (
    <div className="glass-card details-panel">
      <div className="tabs-header">
        <button
          className={`tab-btn ${activeTab === 'image' ? 'active' : ''}`}
          onClick={() => setActiveTab('image')}
        >
          Original Bill
        </button>
        <button
          className={`tab-btn ${activeTab === 'ocr' ? 'active' : ''}`}
          onClick={() => setActiveTab('ocr')}
        >
          Raw OCR Text
        </button>
        <button
          className={`tab-btn ${activeTab === 'json' ? 'active' : ''}`}
          onClick={() => setActiveTab('json')}
        >
          Structured JSON
        </button>
      </div>
      <div className="tab-content">
        {activeTab === 'image' ? (
          (results.image_data_url || previewUrl) ? (
            <div style={{ textAlign: 'center', maxHeight: '70vh', overflow: 'auto', background: '#0b1120', borderRadius: '8px', padding: '0.5rem' }}>
              <img
                src={results.image_data_url || previewUrl || ''}
                alt="Uploaded electricity bill"
                style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px' }}
              />
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              No image preview available for this document.
            </p>
          )
        ) : activeTab === 'ocr' ? (
          <div className="raw-text-content">
            {results.raw_text || 'No OCR text extracted.'}
          </div>
        ) : (
          <pre style={{ textAlign: 'left' }}>
            <code>{JSON.stringify(editableData, null, 2)}</code>
          </pre>
        )}
      </div>
    </div>
  );
};

export default BillViewer;
