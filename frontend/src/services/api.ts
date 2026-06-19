import type { BillData, AnalysisResponse } from '../types/bill';

export class APIError extends Error {
  status: number;
  rawText?: string;
  metadata?: any;

  constructor(message: string, status: number, rawText?: string, metadata?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.rawText = rawText;
    this.metadata = metadata;
  }
}

export const fetchModels = async (): Promise<string[]> => {
  const response = await fetch('/api/models');
  if (!response.ok) {
    throw new Error('Failed to fetch available models');
  }
  const data = await response.json();
  return data.models || [];
};

export const analyzeBill = async (file: File, model: string): Promise<AnalysisResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);

  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = typeof errorData.detail === 'string' 
      ? errorData.detail 
      : (errorData.detail?.message || 'Failed to analyze bill document');
    
    throw new APIError(
      message,
      response.status,
      errorData.raw_text || errorData.detail?.raw_text,
      errorData.metadata || errorData.detail?.metadata
    );
  }

  return response.json();
};

export const calculateBill = async (data: BillData): Promise<{
  success: boolean;
  data: BillData;
  calculations: any;
}> => {
  const response = await fetch('/api/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = typeof errorData.detail === 'string' 
      ? errorData.detail 
      : 'Calculation failed';
    throw new APIError(message, response.status);
  }

  return response.json();
};
