import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import {
	createDefaultConfig,
	getConfigPath,
	loadConfig,
	resetAllConfig,
	resetSettingItem,
	saveConfig,
	updateLastSearch,
	updateSettings,
} from '../dist/main/config-store.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tms-grep-config-'));

app.disableHardwareAcceleration();
app.setPath('userData', tempDir);

app.whenReady().then(() => {
	try {
		const initial = loadConfig();

		assert.equal(initial.success, true);
		assert.equal(initial.config.settings.theme, 'system');
		assert.equal(initial.config.settings.fileNameSearch.maxCandidateFiles, 5000);
		assert.ok(fs.existsSync(getConfigPath()), 'config.json should be created');

		const saveResult = saveConfig({
			...initial.config,
			settings: {
				...initial.config.settings,
				theme: 'dark',
				contentSearch: {
					...initial.config.settings.contentSearch,
					concurrency: 8,
				},
			},
		});

		assert.equal(saveResult.success, true);
		assert.equal(saveResult.config?.settings.theme, 'dark');
		assert.equal(saveResult.config?.settings.contentSearch.concurrency, 8);

		const backupDir    = path.join(tempDir, 'backups');
		const updateResult = updateSettings({
			confirmBeforeSearch: false,
			fileNameSearch       : {
				maxCandidateFiles: 1200,
			},
		});

		assert.equal(updateResult.success, true);
		assert.equal(updateResult.config?.settings.confirmBeforeSearch, false);
		assert.equal(updateResult.config?.settings.fileNameSearch.maxCandidateFiles, 1200);

		const unlimitedResult = updateSettings({
			fileNameSearch: {
				maxCandidateFiles: 0,
			},
		});

		assert.equal(unlimitedResult.success, true);
		assert.equal(unlimitedResult.config?.settings.fileNameSearch.maxCandidateFiles, 0);

		const unlimitedRowsResult = updateSettings({
			results: {
				maxRows: 0,
			},
		});

		assert.equal(unlimitedRowsResult.success, true);
		assert.equal(unlimitedRowsResult.config?.settings.results.maxRows, 0);

		assert.ok(fs.existsSync(backupDir), 'backup directory should exist after update');
		assert.ok(fs.readdirSync(backupDir).length >= 1, 'backup file should exist');

		const lastSearchResult = updateLastSearch({
			fileNameQuery    : '*.java',
			contentQuery     : 'MyLogger',
			targetPath       : 'D:\\src',
			targetExtensions : 'java;ts',
			fileNameRegex    : true,
			contentRegex     : false,
		});

		assert.equal(lastSearchResult.success, true);
		assert.equal(lastSearchResult.config?.lastSearch.fileNameQuery, '*.java');
		assert.equal(lastSearchResult.config?.lastSearch.contentQuery, 'MyLogger');
		assert.equal(lastSearchResult.config?.lastSearch.targetExtensions, 'java;ts');
		assert.equal(lastSearchResult.config?.lastSearch.fileNameRegex, true);
		assert.equal(lastSearchResult.config?.lastSearch.contentRegex, false);

		const resetTheme = resetSettingItem('theme');

		assert.equal(resetTheme.success, true);
		assert.equal(resetTheme.config?.settings.theme, 'system');

		const resetUnknown = resetSettingItem('unknown.key');

		assert.equal(resetUnknown.success, false);

		const resetAll = resetAllConfig();

		assert.equal(resetAll.success, true);
		assert.equal(resetAll.config?.settings.confirmBeforeSearch, true);
		assert.equal(resetAll.config?.lastSearch.fileNameQuery, '*.java', 'lastSearch should be preserved on reset-all');

		const corruptPath = getConfigPath();
		fs.writeFileSync(corruptPath, '{ invalid json', 'utf8');
		const restored = loadConfig();

		assert.equal(restored.success, true);
		assert.equal(restored.config.settings.theme, 'system');
		assert.ok(restored.message, 'restore should include message');

		const clampResult = saveConfig({
			...createDefaultConfig(),
			settings: {
				...createDefaultConfig().settings,
				contentSearch: {
					...createDefaultConfig().settings.contentSearch,
					concurrency: 999,
				},
			},
		});

		assert.equal(clampResult.config?.settings.contentSearch.concurrency, 32);

		console.log('test-config-store: all assertions passed');
		app.exit(0);
	} catch (error) {
		console.error(error);
		app.exit(1);
	} finally {
		fs.rmSync(tempDir, { recursive: true, force: true });
	}
});
