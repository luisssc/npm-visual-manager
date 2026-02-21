import { NpmScript } from '../types';
import './ScriptsPanel.css';

interface ScriptsPanelProps {
  scripts: NpmScript[];
  onRunScript: (scriptName: string) => void;
  isLoading?: boolean;
}

export const ScriptsPanel = ({ scripts, onRunScript, isLoading }: ScriptsPanelProps) => {
  if (scripts.length === 0) {
    return (
      <div className="scripts-panel">
        <div className="scripts-header">
          <i className="codicon codicon-terminal" />
          <span>Scripts</span>
        </div>
        <div className="scripts-empty">No scripts found in package.json</div>
      </div>
    );
  }

  // Priority order for common scripts
  const priorityOrder = ['dev', 'start', 'build', 'test', 'lint', 'preview', 'deploy'];
  
  const sortedScripts = [...scripts].sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a.name);
    const bIndex = priorityOrder.indexOf(b.name);
    
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  // Get color based on script name
  const getScriptColor = (name: string): string => {
    const colors: Record<string, string> = {
      dev: '#4caf50',      // Green
      start: '#2196f3',    // Blue
      build: '#ff9800',    // Orange
      test: '#9c27b0',     // Purple
      lint: '#f44336',     // Red
      preview: '#00bcd4',  // Cyan
      deploy: '#795548',   // Brown
    };
    return colors[name] || 'var(--vscode-button-background)';
  };

  return (
    <div className="scripts-panel">
      <div className="scripts-header">
        <i className="codicon codicon-terminal" />
        <span>Scripts ({scripts.length})</span>
      </div>
      <div className="scripts-grid">
        {sortedScripts.map((script) => (
          <button
            key={script.name}
            className="script-btn"
            onClick={() => onRunScript(script.name)}
            disabled={isLoading}
            title={script.command}
            style={{ 
              borderLeft: `3px solid ${getScriptColor(script.name)}`,
            } as React.CSSProperties}
          >
            <span className="script-name">{script.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
