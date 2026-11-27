import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores only the Mina session token in the operating system secure store.
/// Android uses encrypted platform storage; Apple platforms use Keychain.
/// Windows uses the plugin's supported Windows secure-storage backend.
class SecureTokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'mina.session.token.v1';
  final FlutterSecureStorage _storage;

  Future<void> write(String token) =>
      _storage.write(key: _key, value: token);

  Future<String?> read() => _storage.read(key: _key);

  Future<void> clear() => _storage.delete(key: _key);
}
