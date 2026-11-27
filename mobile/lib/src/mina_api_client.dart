import 'dart:convert';

import 'package:http/http.dart' as http;

import 'secure_token_store.dart';

const _defaultApiBase = 'https://mina-ai-api.teknomail2025.workers.dev';

/// Shared API boundary for Android, Windows, and macOS clients.
/// Provider credentials must never be placed in this client.
class MinaApiClient {
  MinaApiClient({
    required SecureTokenStore tokenStore,
    http.Client? httpClient,
    String apiBase = const String.fromEnvironment(
      'MINA_API_BASE',
      defaultValue: _defaultApiBase,
    ),
    String platform = 'unknown',
  })  : _tokenStore = tokenStore,
        _http = httpClient ?? http.Client(),
        _baseUri = _validatedBaseUri(apiBase),
        _platform = _normalizePlatform(platform);

  final SecureTokenStore _tokenStore;
  final http.Client _http;
  final Uri _baseUri;
  final String _platform;

  static Uri _validatedBaseUri(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        !uri.hasAuthority ||
        (uri.scheme != 'https' &&
            !(uri.scheme == 'http' &&
                (uri.host == 'localhost' || uri.host == '127.0.0.1')))) {
      throw ArgumentError.value(value, 'apiBase', 'A valid HTTPS API URL is required.');
    }
    return uri.replace(path: uri.path.replaceFirst(RegExp(r'/+$'), ''));
  }

  static String _normalizePlatform(String value) {
    const allowed = {'android', 'windows', 'macos', 'unknown'};
    final normalized = value.toLowerCase().trim();
    return allowed.contains(normalized) ? normalized : 'unknown';
  }

  Uri endpoint(String path) {
    if (!path.startsWith('/api/')) {
      throw ArgumentError.value(path, 'path', 'Only Mina /api/ routes are allowed.');
    }
    return _baseUri.replace(path: '${_baseUri.path}$path');
  }

  Future<Map<String, dynamic>> login({
    required String username,
    required String password,
    bool rememberMe = false,
  }) async {
    final response = await _http.post(
      endpoint('/api/auth/login'),
      headers: _headers(json: true),
      body: jsonEncode({
        'username': username.trim(),
        'password': password,
        'rememberMe': rememberMe,
      }),
    );
    final data = _decode(response);
    final token = data['token'];
    if (response.statusCode < 200 ||
        response.statusCode >= 300 ||
        token is! String ||
        token.isEmpty) {
      throw MinaApiException(
        response.statusCode,
        _safeMessage(data['error']),
      );
    }
    await _tokenStore.write(token);
    return data;
  }

  Future<Map<String, dynamic>> currentUser() async {
    final response = await _http.get(
      endpoint('/api/auth/me'),
      headers: await _headersWithToken(),
    );
    final data = _decode(response);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw MinaApiException(response.statusCode, _safeMessage(data['error']));
    }
    return data;
  }

  Future<void> logout() => _tokenStore.clear();

  Future<Map<String, String>> _headersWithToken() async {
    final headers = _headers();
    final token = await _tokenStore.read();
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Map<String, String> _headers({bool json = false}) => {
        'Accept': 'application/json',
        'X-Mina-Client-Platform': _platform,
        if (json) 'Content-Type': 'application/json',
      };

  Map<String, dynamic> _decode(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) return decoded;
    } on FormatException {
      // Do not expose raw upstream response bodies to the UI.
    }
    return const {};
  }

  String _safeMessage(Object? value) {
    if (value is String && value.length <= 240) return value;
    return 'Mina API request failed.';
  }

  void close() => _http.close();
}

class MinaApiException implements Exception {
  const MinaApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => 'MinaApiException($statusCode): $message';
}
