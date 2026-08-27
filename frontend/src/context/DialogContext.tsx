import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type DialogType = 'alert' | 'confirm' | 'prompt' | 'choice';

interface ChoiceOption {
  label: string;
  value: string;
  danger?: boolean;
}

interface DialogState {
  isOpen: boolean;
  type: DialogType;
  message: string;
  defaultValue: string;
  choices: ChoiceOption[];
  resolve: ((value?: any) => void) | null;
}

interface DialogContextType {
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
  showPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  showChoice: (message: string, choices: ChoiceOption[]) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useDialog must be used within DialogProvider");
  return context;
};

export const DialogProvider = ({ children }: { children: ReactNode }) => {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    type: 'alert',
    message: '',
    defaultValue: '',
    choices: [],
    resolve: null
  });

  const [inputValue, setInputValue] = useState('');

  const closeDialog = () => {
    setDialogState(prev => ({ ...prev, isOpen: false }));
  };

  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'alert',
        message,
        defaultValue: '',
        choices: [],
        resolve: () => {
          closeDialog();
          resolve();
        }
      });
    });
  }, []);

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'confirm',
        message,
        defaultValue: '',
        choices: [],
        resolve: (result: boolean) => {
          closeDialog();
          resolve(result);
        }
      });
    });
  }, []);

  const showPrompt = useCallback((message: string, defaultValue = ''): Promise<string | null> => {
    setInputValue(defaultValue);
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'prompt',
        message,
        defaultValue,
        choices: [],
        resolve: (result: string | null) => {
          closeDialog();
          resolve(result);
        }
      });
    });
  }, []);

  const showChoice = useCallback((message: string, choices: ChoiceOption[]): Promise<string | null> => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'choice',
        message,
        defaultValue: '',
        choices,
        resolve: (result: string | null) => {
          closeDialog();
          resolve(result);
        }
      });
    });
  }, []);

  const handleConfirm = () => {
    if (dialogState.type === 'prompt') {
      dialogState.resolve?.(inputValue);
    } else if (dialogState.type === 'confirm') {
      dialogState.resolve?.(true);
    } else {
      dialogState.resolve?.();
    }
  };

  const handleCancel = () => {
    if (dialogState.type === 'prompt') {
      dialogState.resolve?.(null);
    } else if (dialogState.type === 'confirm') {
      dialogState.resolve?.(false);
    } else if (dialogState.type === 'choice') {
      dialogState.resolve?.(null);
    } else {
      dialogState.resolve?.();
    }
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt, showChoice }}>
      {children}
      {dialogState.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(11, 15, 25, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#191e2b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '2rem',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
            animation: 'slideUp 0.3s ease'
          }}>
            <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 500, marginBottom: '1rem', marginTop: 0 }}>
              {dialogState.type === 'prompt' ? 'Input Required' : 'Notice'}
            </h3>
            
            <p style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem', whiteSpace: 'pre-wrap' }}>
              {dialogState.message}
            </p>
            
            {dialogState.type === 'prompt' && (
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                style={{
                  width: '100%',
                  background: '#11141d',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  color: 'white',
                  marginBottom: '1.5rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            )}

            {dialogState.type === 'choice' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {dialogState.choices.map(choice => (
                  <button
                    key={choice.value}
                    onClick={() => dialogState.resolve?.(choice.value)}
                    style={{
                      background: choice.danger ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)',
                      border: `1px solid ${choice.danger ? 'rgba(239,68,68,0.3)' : 'rgba(139,92,246,0.3)'}`,
                      color: choice.danger ? '#f87171' : '#a78bfa',
                      padding: '0.6rem 1rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = choice.danger ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.25)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = choice.danger ? 'rgba(239,68,68,0.15)' : 'rgba(139,92,246,0.15)';
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
                <button
                  onClick={handleCancel}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#9ca3af',
                    padding: '0.6rem 1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    marginTop: '0.25rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                {dialogState.type !== 'alert' && (
                  <button 
                    onClick={handleCancel}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#9ca3af',
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                  >
                    Cancel
                  </button>
                )}
                
                <button 
                  onClick={handleConfirm}
                  style={{
                    background: 'var(--accent-primary, #8b5cf6)',
                    border: 'none',
                    color: 'white',
                    padding: '0.5rem 1.5rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.4)'; }}
                >
                  {dialogState.type === 'confirm' ? 'Confirm' : 'OK'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
