/**
 * Tool Approval Dialog Component
 * Shows approval prompt before executing tools
 */

import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, FileText, Terminal, Globe, Database } from 'lucide-react';

export interface ToolApprovalRequest {
  tool: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

export interface ToolApprovalResponse {
  allowed: boolean;
  allowAll: boolean;
}

interface ToolApprovalDialogProps {
  request: ToolApprovalRequest | null;
  onResponse: (response: ToolApprovalResponse) => void;
}

// Tool icons mapping
const TOOL_ICONS: Record<string, React.ReactNode> = {
  write_file: <FileText size={24} />,
  read_file: <FileText size={24} />,
  create_directory: <FileText size={24} />,
  list_directory: <FileText size={24} />,
  apply_patch: <FileText size={24} />,
  execute_command: <Terminal size={24} />,
  web_search: <Globe size={24} />,
  web_fetch: <Globe size={24} />,
  http_request: <Globe size={24} />,
  code_search: <Terminal size={24} />,
  find_symbol: <Terminal size={24} />,
  package_install: <Terminal size={24} />,
  start_server: <Globe size={24} />,
  run_tests: <Terminal size={24} />,
  generate_documentation: <FileText size={24} />,
  mcp_connect: <Database size={24} />,
  mcp_list_tools: <Database size={24} />,
  mcp_invoke_tool: <Database size={24} />,
  mcp_disconnect: <Database size={24} />,
  mcp_list_connections: <Database size={24} />,
};

// Tool risk levels
const TOOL_RISK: Record<string, 'low' | 'medium' | 'high'> = {
  write_file: 'medium',
  read_file: 'low',
  create_directory: 'low',
  list_directory: 'low',
  apply_patch: 'medium',
  execute_command: 'high',
  web_search: 'low',
  web_fetch: 'low',
  http_request: 'medium',
  code_search: 'low',
  find_symbol: 'low',
  package_install: 'medium',
  start_server: 'low',
  run_tests: 'low',
  generate_documentation: 'low',
  mcp_connect: 'medium',
  mcp_list_tools: 'low',
  mcp_invoke_tool: 'high',
  mcp_disconnect: 'low',
  mcp_list_connections: 'low',
};

export function ToolApprovalDialog({ request, onResponse }: ToolApprovalDialogProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (request) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [request]);

  if (!isVisible || !request) return null;

  const riskLevel = TOOL_RISK[request.tool] || 'medium';
  const riskColor = {
    low: '#4CAF50',
    medium: '#FF9800',
    high: '#f44336'
  }[riskLevel];

  const riskLabel = {
    low: 'Low Risk',
    medium: 'Medium Risk',
    high: 'High Risk'
  }[riskLevel];

  const handleAllow = () => {
    onResponse({ allowed: true, allowAll: false });
    setIsVisible(false);
  };

  const handleAllowAll = () => {
    onResponse({ allowed: true, allowAll: true });
    setIsVisible(false);
  };

  const handleReject = () => {
    onResponse({ allowed: false, allowAll: false });
    setIsVisible(false);
  };

  // Format arguments for display
  const formatArguments = () => {
    const args = request.arguments;
    const formatted: string[] = [];
    
    for (const [key, value] of Object.entries(args)) {
      let displayValue: string;
      if (typeof value === 'string') {
        displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
        displayValue = `"${displayValue}"`;
      } else if (typeof value === 'object' && value !== null) {
        displayValue = JSON.stringify(value, null, 2).substring(0, 200);
        if (JSON.stringify(value).length > 200) displayValue += '...';
      } else {
        displayValue = String(value);
      }
      formatted.push(`${key}: ${displayValue}`);
    }
    
    return formatted.length > 0 ? formatted.join('\n') : '(no arguments)';
  };

  // Get description of what the tool will do
  const getToolDescription = () => {
    const args = request.arguments;
    const descriptions: Record<string, () => string> = {
      write_file: () => `Create or overwrite file: ${args.path || 'unknown'}`,
      read_file: () => `Read file: ${args.path || 'unknown'}`,
      create_directory: () => `Create directory: ${args.path || 'unknown'}`,
      list_directory: () => `List files in: ${args.path || 'current directory'}`,
      apply_patch: () => `Apply patch to files`,
      execute_command: () => `Execute command: ${args.command || 'unknown'}`,
      web_search: () => `Search web for: "${args.query || 'unknown'}"`,
      web_fetch: () => `Fetch content from: ${args.url || 'unknown'}`,
      http_request: () => `HTTP ${args.method || 'GET'} request to: ${args.url || 'unknown'}`,
      code_search: () => `Search code for: "${args.pattern || 'unknown'}"`,
      find_symbol: () => `Find symbol: "${args.symbol || 'unknown'}"`,
      package_install: () => `Install packages: ${args.packages || 'unknown'}`,
      start_server: () => `Start HTTP server on port ${args.port || '8080'}`,
      run_tests: () => `Run test suite`,
      generate_documentation: () => `Generate ${args.type || 'documentation'}`,
      mcp_connect: () => `Connect to MCP server: ${args.name || 'unknown'}`,
      mcp_list_tools: () => `List tools from: ${args.connection_name || 'unknown'}`,
      mcp_invoke_tool: () => `Invoke MCP tool: ${args.tool_name || 'unknown'}`,
      mcp_disconnect: () => `Disconnect from: ${args.connection_name || 'unknown'}`,
      mcp_list_connections: () => `List all MCP connections`,
    };

    const describer = descriptions[request.tool];
    return describer ? describer() : `Execute ${request.tool}`;
  };

  return (
    <div className="tool-approval-overlay">
      <div className="tool-approval-dialog">
        <div className="approval-header">
          <div className="approval-icon" style={{ color: riskColor }}>
            {riskLevel === 'high' ? <AlertTriangle size={32} /> : TOOL_ICONS[request.tool] || <Shield size={32} />}
          </div>
          <div className="approval-title">
            <h3>Tool Execution Request</h3>
            <span className="risk-badge" style={{ backgroundColor: riskColor + '20', color: riskColor, border: `1px solid ${riskColor}` }}>
              {riskLabel}
            </span>
          </div>
        </div>

        <div className="approval-content">
          <div className="tool-info">
            <div className="tool-name">{request.tool}</div>
            <div className="tool-description">{getToolDescription()}</div>
          </div>

          <div className="arguments-section">
            <button 
              className="toggle-details-btn"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide Details' : 'Show Arguments'}
            </button>
            
            {showDetails && (
              <div className="arguments-details">
                <pre>{formatArguments()}</pre>
              </div>
            )}
          </div>

          <div className="approval-warning">
            <AlertTriangle size={16} />
            <span>This action will be executed on your local machine</span>
          </div>
        </div>

        <div className="approval-actions">
          <button 
            className="btn btn-danger reject-btn"
            onClick={handleReject}
          >
            <XCircle size={18} />
            Reject
          </button>
          
          <div className="allow-actions">
            <button 
              className="btn btn-secondary allow-once-btn"
              onClick={handleAllow}
            >
              <CheckCircle size={18} />
              Allow Once
            </button>
            
            <button 
              className="btn btn-primary allow-all-btn"
              onClick={handleAllowAll}
            >
              <Shield size={18} />
              Allow All
            </button>
          </div>
        </div>

        <div className="approval-footer">
          <span className="timestamp">{new Date(request.timestamp).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
