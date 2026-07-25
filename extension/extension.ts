import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export function activate(context: vscode.ExtensionContext) {
    // ── Sidebar portal provider ──
    const provider = new WaveOSPortalViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(WaveOSPortalViewProvider.viewType, provider)
    );

    // ── "Open Wave OS" command — opens in Cursor Simple Browser tab ──
    const openCmd = vscode.commands.registerCommand('wave-os.openDesktop', () => {
        const uri = vscode.Uri.parse('https://oswave.io');
        vscode.commands.executeCommand('simpleBrowser.show', uri.toString());
    });
    context.subscriptions.push(openCmd);

    // ── Status bar item ──
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = '$(radio-tower) Wave OS';
    statusBar.tooltip = 'Open Wave OS in Cursor';
    statusBar.command = 'wave-os.openDesktop';
    statusBar.show();
    context.subscriptions.push(statusBar);
}

export function deactivate() {}

class WaveOSPortalViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'wave-os.portal';

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'openInBrowser': {
                    // Open in Simple Browser inside Cursor instead of external
                    const uri = vscode.Uri.parse(data.url || 'https://oswave.io');
                    vscode.commands.executeCommand('simpleBrowser.show', uri.toString());
                    break;
                }
                case 'mcpCall': {
                    try {
                        const response = await this._callMcpBackend(data.payload);
                        webviewView.webview.postMessage({
                            type: 'mcpResponse',
                            id: data.id,
                            payload: response
                        });
                    } catch (error: any) {
                        webviewView.webview.postMessage({
                            type: 'mcpResponse',
                            id: data.id,
                            error: error.message || String(error)
                        });
                    }
                    break;
                }
                case 'getActivity': {
                    webviewView.webview.postMessage({
                        type: 'activityResponse',
                        id: data.id,
                        payload: []
                    });
                    break;
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const mediaPath = vscode.Uri.joinPath(this._extensionUri, 'media');
        const htmlPath = path.join(mediaPath.fsPath, 'portal.html');
        
        let html = '';
        try {
            html = fs.readFileSync(htmlPath, 'utf8');
        } catch (err) {
            return `<html><body>Error loading portal.html: ${err}</body></html>`;
        }

        html = html.replace(/\{\{cspSource\}\}/g, webview.cspSource);
        html = html.replace(/(src|href)="media\/([^"]+)"/g, (match, attr, relativePath) => {
            const uri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', relativePath));
            return `${attr}="${uri}"`;
        });
        html = html.replace(/\{\{mediaUri\}\}/g, webview.asWebviewUri(mediaPath).toString());

        return html;
    }

    private _callMcpBackend(payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const backendUrlStr = process.env.MCP_BACKEND_URL || 'https://oswave.io/api/functions/mcpRouter';
            let url: URL;
            try {
                url = new URL(backendUrlStr);
            } catch (err) {
                return reject(new Error(`Invalid MCP_BACKEND_URL: ${backendUrlStr}`));
            }

            const postData = JSON.stringify(payload);
            const isHttps = url.protocol === 'https:';
            const requestLib = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = requestLib.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try { resolve(JSON.parse(data)); }
                        catch (e) { reject(new Error(`Failed to parse response: ${data}`)); }
                    } else {
                        reject(new Error(`Request failed ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on('error', reject);
            req.write(postData);
            req.end();
        });
    }
}
