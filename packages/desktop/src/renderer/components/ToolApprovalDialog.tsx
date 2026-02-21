/**
 * Tool Approval Dialog Component
 * Shows approval prompt before executing tools
 */

import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, FileText, Terminal, Globe, Database, Play, Search, FileCode, Wrench, Monitor } from 'lucide-react';

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
  code_search: <FileCode size={24} />,
  find_symbol: <Search size={24} />,
  package_install: <Wrench size={24} />,
  start_server: <Play size={24} />,
  run_tests: <Terminal size={24} />,
  generate_documentation: <FileText size={24} />,
  mcp_connect: <Database size={24} />,
  mcp_list_tools: <Database size={24} />,
  mcp_invoke_tool: <Database size={24} />,
  mcp_disconnect: <Database size={24} />,
  mcp_list_connections: <Database size={24} />,
  browser: <Monitor size={24} />,
  git_status: <Terminal size={24} />,
  git_log: <Terminal size={24} />,
  git_diff: <Terminal size={24} />,
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
  browser: 'high',
  git_status: 'low',
  git_log: 'low',
  git_diff: 'low',
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

  // Get detailed description of what the tool will do
  const getToolDescription = () => {
    const args = request.arguments;
    
    const descriptions: Record<string, () => { action: string; details: string }> = {
      write_file: () => ({
        action: `CREATE OR OVERWRITE FILE`,
        details: `Path: ${args.path || 'unknown'}\nThis will write ${args.content ? (args.content as string).length + ' characters' : 'content'} to the specified file. If the file exists, it will be replaced.`
      }),
      read_file: () => ({
        action: `READ FILE CONTENTS`,
        details: `Path: ${args.path || 'unknown'}\nThis will read and display the contents of the specified file.`
      }),
      create_directory: () => ({
        action: `CREATE NEW DIRECTORY`,
        details: `Path: ${args.path || 'unknown'}\nThis will create a new folder/directory at the specified location.`
      }),
      list_directory: () => ({
        action: `LIST DIRECTORY CONTENTS`,
        details: `Path: ${args.path || 'current directory'}\nThis will show all files and folders in the specified directory.`
      }),
      apply_patch: () => ({
        action: `APPLY CODE PATCH`,
        details: `This will modify files by applying a diff/patch. Changes may affect multiple files.`
      }),
      execute_command: () => ({
        action: `EXECUTE SHELL COMMAND`,
        details: `Command: ${args.command || 'unknown'}\n⚠️ This will run a system command on your machine. Only approve if you understand exactly what this command does.`
      }),
      web_search: () => ({
        action: `SEARCH THE WEB`,
        details: `Query: "${args.query || 'unknown'}"\nThis will search Google and return search results.`
      }),
      web_fetch: () => ({
        action: `FETCH WEBPAGE CONTENT`,
        details: `URL: ${args.url || 'unknown'}\nThis will download and extract content from the specified webpage.`
      }),
      http_request: () => ({
        action: `MAKE HTTP REQUEST`,
        details: `Method: ${args.method || 'GET'}\nURL: ${args.url || 'unknown'}\nThis will send an HTTP request to the specified URL.`
      }),
      code_search: () => ({
        action: `SEARCH IN CODEBASE`,
        details: `Pattern: "${args.pattern || 'unknown'}"\nThis will search for text/patterns in your project files.`
      }),
      find_symbol: () => ({
        action: `FIND CODE SYMBOL`,
        details: `Symbol: "${args.symbol || 'unknown'}"\nThis will search for a specific function, class, or variable name in your code.`
      }),
      package_install: () => ({
        action: `INSTALL PACKAGES`,
        details: `Packages: ${args.packages || 'unknown'}\nThis will install software packages (npm, pip, etc.) on your system.`
      }),
      start_server: () => ({
        action: `START HTTP SERVER`,
        details: `Port: ${args.port || '8080'}\nThis will start a local web server that can serve files.`
      }),
      run_tests: () => ({
        action: `RUN TEST SUITE`,
        details: `This will execute your project's test suite (unit tests, integration tests, etc.).`
      }),
      generate_documentation: () => ({
        action: `GENERATE DOCUMENTATION`,
        details: `Type: ${args.type || 'documentation'}\nThis will automatically generate docs for your code.`
      }),
      browser: () => ({
        action: `CONTROL WEB BROWSER`,
        details: `Action: ${args.action || 'unknown'}\n${args.action === 'navigate' ? `Will navigate to: ${args.url || 'unknown'}` : ''}${args.action === 'start' ? 'Will launch Chrome/Chromium browser' : ''}${args.action === 'click' || args.action === 'type' ? `Will interact with webpage elements` : ''}\n⚠️ Browser automation can access any website and interact with web pages.`
      }),
      git_status: () => ({
        action: `CHECK GIT STATUS`,
        details: `This will show the current git status (modified files, staged changes, etc.).`
      }),
      git_log: () => ({
        action: `VIEW GIT HISTORY`,
        details: `This will display the git commit history.`
      }),
      git_diff: () => ({
        action: `SHOW GIT DIFFERENCES`,
        details: `This will show changes between commits or working directory.`
      }),
      mcp_connect: () => ({
        action: `CONNECT TO MCP SERVER`,
        details: `Server: ${args.name || 'unknown'}\nThis will connect to an external MCP (Model Context Protocol) server.`
      }),
      mcp_list_tools: () => ({
        action: `LIST MCP TOOLS`,
        details: `Connection: ${args.connection_name || 'unknown'}\nThis will retrieve available tools from an MCP server.`
      }),
      mcp_invoke_tool: () => ({
        action: `INVOKE MCP TOOL`,
        details: `Tool: ${args.tool_name || 'unknown'}\nThis will execute a tool on an external MCP server.\n⚠️ MCP tools can execute arbitrary code on external systems.`
      }),
      mcp_disconnect: () => ({
        action: `DISCONNECT FROM MCP`,
        details: `Connection: ${args.connection_name || 'unknown'}\nThis will close the connection to an MCP server.`
      }),
      mcp_list_connections: () => ({
        action: `LIST MCP CONNECTIONS`,
        details: `This will show all active MCP server connections.`
      }),
    };

    const describer = descriptions[request.tool];
    return describer ? describer() : { action: `EXECUTE ${request.tool.toUpperCase()}`, details: 'This tool will execute with the provided arguments.' };
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
            <div className="tool-action-title">{(() => {
              const desc = getToolDescription();
              return desc.action;
            })()}</div>
            <div className="tool-description">
              {(() => {
                const desc = getToolDescription();
                return desc.details.split('\n').map((line, i) => (
                  <div key={i} className={line.startsWith('⚠️') ? 'warning-line' : 'detail-line'}>
                    {line}
                  </div>
                ));
              })()}
            </div>
          </div>

          <div className="arguments-section">
            <button 
              className="toggle-details-btn"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Hide Technical Details' : 'Show Technical Details'}
            </button>
            
            {showDetails && (
              <div className="arguments-details">
                <div className="tool-name-display">
                  <strong>Tool:</strong> {request.tool}
                </div>
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
            Deny
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
              title="Allow all tools for this workspace without asking again"
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
