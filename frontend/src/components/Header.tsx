import React from 'react';
import { Zap } from 'lucide-react';

interface HeaderProps {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  models: string[];
}

export const Header: React.FC<HeaderProps> = ({ selectedModel, setSelectedModel, models }) => {
  return (
    <header className="app-header">
      <div className="logo-section">
        <Zap className="logo-icon" size={40} />
        <h1>JouleScrape</h1>
        <span>v1.0-OCR</span>
      </div>
      
      <div className="model-config">
        <label htmlFor="model-select">LLM Engine:</label>
        <select 
          id="model-select" 
          className="model-select"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {models.map(model => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>
    </header>
  );
};
export default Header;
