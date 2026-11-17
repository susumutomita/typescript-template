"""Exercise receipts with real subprocesses in disposable Git repositories."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from verify import verify


class VerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'repo'
        self.root.mkdir()
        self.command('init', '-q')
        self.command('config', 'user.email', 'test@example.invalid')
        self.command('config', 'user.name', 'Test')
        self.map = self.root / 'verification.json'

    def command(self, *args):
        subprocess.run(['git', '-C', str(self.root), *args], check=True, capture_output=True)

    def fixture(self, checks):
        self.map.write_text(json.dumps({'version': 1, 'features': [
            {'id': 'fixture', 'paths': ['fixture.py'], 'checks': list(checks)}],
            'profiles': {'fast': list(checks)}, 'checks': checks}))
        self.command('add', '.')
        self.command('commit', '-qm', 'fixture')

    def run_checks(self):
        return verify(self.root, self.map, 'fast', self.base / 'evidence')

    def test_success_has_exit_code_log_and_commit(self):
        self.fixture({'ok': {'argv': [sys.executable, '-c', 'print("evidence")']}})
        result = self.run_checks()
        self.assertEqual(result['status'], 'passed')
        self.assertTrue(result['checkout_clean_unchanged'])
        self.assertEqual(result['checks'][0]['exit_code'], 0)
        self.assertEqual(Path(result['checks'][0]['log']).read_text(), 'evidence\n')
        self.assertEqual(len(result['checks'][0]['log_sha256']), 64)

    def test_failure_is_not_success(self):
        self.fixture({'bad': {'argv': [sys.executable, '-c', 'raise SystemExit(7)']}})
        result = self.run_checks()
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['checks'][0]['exit_code'], 7)

    def test_missing_environment_and_explicit_block(self):
        self.fixture({'missing': {'argv': ['/nonexistent/verification-tool']},
                      'vm': {'blocked_reason': 'No VM fixture'}})
        result = self.run_checks()
        self.assertEqual(result['status'], 'blocked')
        self.assertTrue(all(c['status'] == 'blocked' for c in result['checks']))

    def test_timeout_fails(self):
        self.fixture({'slow': {'argv': [sys.executable, '-c', 'import time; time.sleep(10)'],
                               'timeout_seconds': 1}})
        self.assertEqual(self.run_checks()['status'], 'failed')

    def test_dirty_tree_cannot_attest_clean_head(self):
        self.fixture({'ok': {'argv': [sys.executable, '-c', 'pass']}})
        (self.root / 'untracked').write_text('change')
        result = self.run_checks()
        self.assertEqual(result['status'], 'blocked')
        self.assertEqual(result['checks'][0]['status'], 'passed')
        self.assertFalse(result['checkout_clean_unchanged'])

    def test_command_mutation_invalidates_receipt(self):
        self.fixture({'mutate': {'argv': [sys.executable, '-c', 'open("new", "w").close()']}})
        self.assertEqual(self.run_checks()['status'], 'blocked')

    def test_empty_profile_rejected(self):
        self.fixture({})
        with self.assertRaises(ValueError):
            self.run_checks()

    def test_output_inside_checkout_rejected(self):
        self.fixture({'ok': {'argv': [sys.executable, '-c', 'pass']}})
        with self.assertRaises(ValueError):
            verify(self.root, self.map, 'fast', self.root / 'evidence')

    def test_existing_evidence_not_overwritten(self):
        self.fixture({'ok': {'argv': [sys.executable, '-c', 'pass']}})
        self.run_checks()
        with self.assertRaises(FileExistsError):
            self.run_checks()

    def test_bad_later_id_does_not_run_first_command(self):
        self.fixture({'mutate': {'argv': [sys.executable, '-c', 'open("new", "w").close()']},
                      '../invalid': {'argv': [sys.executable, '-c', 'pass']}})
        with self.assertRaises(ValueError):
            self.run_checks()
        self.assertFalse((self.root / 'new').exists())

    def test_nonexecutable_is_blocked_with_receipt(self):
        binary = self.base / 'not-executable'
        binary.write_text('not executable')
        self.fixture({'ok': {'argv': [sys.executable, '-c', 'pass']},
                      'denied': {'argv': [str(binary)]}})
        result = self.run_checks()
        self.assertEqual(result['checks'][0]['status'], 'passed')
        self.assertEqual(result['checks'][1]['status'], 'blocked')
        self.assertTrue((self.base / 'evidence' / 'receipt.json').exists())

    def test_timeout_kills_descendants(self):
        marker = self.base / 'late-marker'
        child = f'import time; time.sleep(2); open({str(marker)!r}, "w").close()'
        code = f'import subprocess, time; subprocess.Popen([{sys.executable!r}, "-c", {child!r}]); time.sleep(10)'
        self.fixture({'slow': {'argv': [sys.executable, '-c', code], 'timeout_seconds': 1}})
        self.assertEqual(self.run_checks()['status'], 'failed')
        import time
        time.sleep(2)
        self.assertFalse(marker.exists())

    def test_external_map_records_provenance(self):
        self.fixture({'ok': {'argv': [sys.executable, '-c', 'pass']}})
        external = self.base / 'map.json'
        external.write_bytes(self.map.read_bytes())
        result = verify(self.root, external, 'fast', self.base / 'evidence')
        self.assertEqual(result['map_path'], str(external))
        self.assertEqual(len(result['runner_sha256']), 64)

    def test_deleted_external_map_preserves_blocked_receipt(self):
        external = self.base / 'map.json'
        self.fixture({'remove-map': {'argv': [sys.executable, '-c',
            f'from pathlib import Path; Path({str(external)!r}).unlink()']}})
        external.write_bytes(self.map.read_bytes())
        result = verify(self.root, external, 'fast', self.base / 'evidence')
        self.assertEqual(result['status'], 'blocked')
        self.assertFalse(result['checkout_clean_unchanged'])
        self.assertTrue((self.base / 'evidence' / 'receipt.json').exists())

    def test_command_arguments_are_not_shell_expanded(self):
        self.fixture({'args': {'argv': [sys.executable, '-c', 'import sys; print(sys.argv[1])', '$(touch unsafe)']}})
        result = self.run_checks()
        self.assertEqual(Path(result['checks'][0]['log']).read_text(), '$(touch unsafe)\n')
        self.assertFalse((self.root / 'unsafe').exists())


if __name__ == '__main__':
    unittest.main()
