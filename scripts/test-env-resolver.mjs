import assert from 'node:assert/strict';
import {
	expandEnvString,
	getProcessEnvVar,
	readWindowsRegistryEnvVar,
} from '../dist/main/env-resolver.js';

process.env.TMS_GREP_ENV_RESOLVER_TEST = 'C:\\Tools\\Everything';

try {
	assert.equal(getProcessEnvVar('tms_grep_env_resolver_test'), 'C:\\Tools\\Everything');
	assert.equal(expandEnvString('%TMS_GREP_ENV_RESOLVER_TEST%\\es.exe'), 'C:\\Tools\\Everything\\es.exe');
	assert.equal(expandEnvString('%TMS_GREP_ENV_RESOLVER_TEST_UNSET%\\es.exe'), '%TMS_GREP_ENV_RESOLVER_TEST_UNSET%\\es.exe');
	assert.equal(readWindowsRegistryEnvVar('BAD" & echo unsafe & "'), undefined);

	console.log('test-env-resolver: all assertions passed');
} catch (error) {
	console.error(error);
	process.exit(1);
}
