import 'package:flutter_test/flutter_test.dart';
import 'package:mina_companion/src/mina_api_client.dart';
import 'package:mina_companion/src/secure_token_store.dart';

void main() {
  group('MinaApiClient configuration', () {
    test('defaults to the existing HTTPS Mina Worker', () {
      final client = MinaApiClient(
        tokenStore: _UnusedTokenStore(),
      );
      expect(
        client.endpoint('/api/auth/me').toString(),
        'https://mina-ai-api.teknomail2025.workers.dev/api/auth/me',
      );
      client.close();
    });

    test('rejects insecure non-local API endpoints', () {
      expect(
        () => MinaApiClient(
          tokenStore: _UnusedTokenStore(),
          apiBase: 'http://example.com',
        ),
        throwsArgumentError,
      );
    });

    test('rejects non-API paths', () {
      final client = MinaApiClient(tokenStore: _UnusedTokenStore());
      expect(() => client.endpoint('/admin'), throwsArgumentError);
      client.close();
    });
  });
}

class _UnusedTokenStore implements SecureTokenStore {
  @override
  Future<void> clear() async {}

  @override
  Future<String?> read() async => null;

  @override
  Future<void> write(String token) async {}
}
