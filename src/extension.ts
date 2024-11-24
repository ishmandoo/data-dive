import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as duckdb from 'duckdb';


const SUPPORTED_EXTENSIONS = ["parquet", "csv"]

export function activate(context: vscode.ExtensionContext) {
	console.log("ready")
	let openParquetCommand = vscode.commands.registerCommand('extension.explore', function (uri) {
		if (!uri) {
			// Fallback to the currently active file in the editor
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				uri = activeEditor.document.uri;
			}
		}
	
		if (!uri) {
			vscode.window.showErrorMessage(
				"No file selected. Please use the context menu on a .csv or .parquet file or open a supported file in the editor."
			);
			return;
		}
	
		let fileNameParts = uri.path.split(".");
		const extension = fileNameParts[fileNameParts.length - 1];
	
		if (!SUPPORTED_EXTENSIONS.includes(extension)) {
			vscode.window.showErrorMessage(`Unsupported file type: ${extension}. Please use a .csv or .parquet file.`);
			return;
		}

		let db = new duckdb.Database(':memory:');

		switch (extension) {
			case 'csv':
				db.exec(`CREATE TABLE data AS SELECT * FROM read_csv_auto('${uri.path}');`)
				break;
			case 'parquet':
				db.exec(`CREATE TABLE data AS SELECT * FROM read_parquet('${uri.path}');`)
				break;
		}

		fileNameParts = uri.path.split("/");
		const fileNameShort = fileNameParts[fileNameParts.length - 1];

		let panel = vscode.window.createWebviewPanel(
			'tableView',
			`${fileNameShort} explorer`,
			vscode.ViewColumn.One,
			{ enableScripts: true, retainContextWhenHidden: true, enableFindWidget: true }
		);

		panel.webview.html = getWebviewContent(context);

		panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'execute':
						db.all(message.query, function (err, res) {
							if (err) {
								console.log(err);
								panel.webview.postMessage({
									command: 'showError',
									error: err.message
								});
							} else {
								const headers = Object.keys(res[0]);

								// Create table headers
								let tableHeaders = `<tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr>`;

								// Create table rows
								let tableRows = res.map(row =>
									`<tr>${headers.map(header => `<td><pre>${JSON.stringify(row[header], null, 2)}</pre></td>`).join('')}</tr>`
								).join('');

								panel.webview.postMessage({
									command: 'showResult',
									tableHTML: `
									<table>
										${tableHeaders}
										${tableRows}
									</table>
								`
								});
							}
						});

				}
			},
			undefined,
			context.subscriptions
		);


		const starting_query = "SELECT * FROM data LIMIT 100"
		panel.webview.postMessage({
			command: 'init',
			query: starting_query
		});


	});

	context.subscriptions.push(openParquetCommand);
}

function getWebviewContent(context: vscode.ExtensionContext): string {
    const htmlFilePath = path.join(context.extensionPath, 'src/webview.html');
    return fs.readFileSync(htmlFilePath, 'utf8');
}
