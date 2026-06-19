import React from 'react';
import { Sparkles } from 'lucide-react';

interface AnalysisProgressProps {
  loading: boolean;
  loadingStep: 'ocr' | 'llm' | 'parse' | 'done';
  hasResults: boolean;
}

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({
  loading,
  loadingStep,
  hasResults,
}) => {
  if (!loading && !hasResults) {
    return (
      <div className="intro-placeholder">
        <Sparkles className="intro-icon" size={80} />
        <h2>Awaiting Statement Upload</h2>
        <p>Provide a bill statement on the left to extract provider metadata, consumption patterns, rates, and total balance due using optical recognition.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card loading-container">
        <div className="spinner-ring"></div>
        <div className="loading-text">Decoding Statement Structure</div>
        <div className="loading-steps">
          <div className={`step-item ${loadingStep === 'ocr' ? 'active' : ''} ${['llm', 'parse', 'done'].includes(loadingStep) ? 'done' : ''}`}>
            <span className="step-bullet"></span>
            Running OCR engine on document layout
          </div>
          <div className={`step-item ${loadingStep === 'llm' ? 'active' : ''} ${['parse', 'done'].includes(loadingStep) ? 'done' : ''}`}>
            <span className="step-bullet"></span>
            Consulting LLM models for parameter maps
          </div>
          <div className={`step-item ${loadingStep === 'parse' ? 'active' : ''} ${loadingStep === 'done' ? 'done' : ''}`}>
            <span className="step-bullet"></span>
            Structuring JSON metrics dashboard
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default AnalysisProgress;
