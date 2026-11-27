import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mina_companion/src/mina_api_client.dart';
import 'package:mina_companion/src/secure_token_store.dart';

void main() {
  group('MinaApiClient configuration', () {
    test('defaults to the existing HTTPS Mina Worker', () {
      final client = MinaApiClient(tokenStore: _FakeTokenStore());
      expect(
        client.endpoint('/api/auth/me').toString(),
        'https://mina-ai-api.teknomail2025.workers.dev/api/auth/me',
      );
      client.close();
    });

    test('rejects insecure non-local API endpoints', () {
      expect(
        () => MinaApiClient(
          tokenStore: _FakeTokenStore(),
          apiBase: 'http://example.com',
        ),
        throwsArgumentError,
      );
    });

    test('rejects non-API paths', () {
      final client = MinaApiClient(tokenStore: _FakeTokenStore());
      expect(() => client.endpoint('/admin'), throwsArgumentError);
      client.close();
    });
  });

  group('MinaApiClient authentication', () {
    test('logs in, stores the session, authenticates current-user, and clears on logout', () async {
      final tokenStore = _FakeTokenStore();
      final httpClient = _FakeHttpClient((request) {
        if (request.url.path == '/api/auth/login') {
          expect(request.method, 'POST');
          expect(request.headers['x-mina-client-platform'], 'android');
          final body = jsonDecode((request as http.Request).body) as Map;
          expect(body['username'], 'baba');
          expect(body['rememberMe'], isTrue);
          return http.Response(
            jsonEncode({'token': 'session-token', 'user': {'username': 'baba'}}),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        expect(request.url.path, '/api/auth/me');
        expect(request.method, 'GET');
        expect(request.headers['authorization'], 'Bearer session-token');
        return http.Response(
          jsonEncode({'authenticated': true, 'user': {'username': 'baba'}}),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final client = MinaApiClient(
        tokenStore: tokenStore,
        httpClient: httpClient,
        platform: 'android',
      );

      final login = await client.login(
        username: ' baba ',
        password: 'test-password',
        rememberMe: true,
      );
      expect(login['user']['username'], 'baba');
      expect(tokenStore.token, 'session-token');

      final user = await client.currentUser();
      expect(user['authenticated'], isTrue);
      expect(httpClient.requests, hasLength(2));

      await client.logout();
      expect(tokenStore.token, isNull);
      expect(tokenStore.clearCount, 1);
      client.close();
    });

    test('does not store a token when login is rejected', () async {
      final tokenStore = _FakeTokenStore();
      final client = MinaApiClient(
        tokenStore: tokenStore,
        httpClient: _FakeHttpClient(
          (_) => http.Response(
            jsonEncode({'error': 'Kullanıcı adı veya şifre hatalı.'}),
            401,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      await expectLater(
        client.login(username: 'baba', password: 'wrong'),
        throwsA(
          isA<MinaApiException>()
              .having((error) => error.statusCode, 'statusCode', 401)
              .having((error) => error.message, 'message', 'Kullanıcı adı veya şifre hatalı.'),
        ),
      );
      expect(tokenStore.token, isNull);
      client.close();
    });
  });
}

class _FakeTokenStore implements SecureTokenStore {
  String? token;
  int clearCount = 0;

  @override
  Future<void> clear() async {
    token = null;
    clearCount++;
  }

  @override
  Future<String?> read() async => token;

  @override
  Future<void> write(String value) async {
    token = value;
  }
}

class _FakeHttpClient extends http.BaseClient {
  _FakeHttpClient(this.respond);

  final http.Response Function(http.BaseRequest request) respond;
  final List<http.BaseRequest> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);
    final response = respond(request);
    return http.StreamedResponse(
      Stream.value(utf8.encode(response.body)),
      response.statusCode,
      headers: response.headers,
      request: request,
    );
  }
}
