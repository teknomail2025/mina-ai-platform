import 'dart:io';

Future<void> main() async {
  final manifest = File('android/app/src/main/AndroidManifest.xml');
  if (!await manifest.exists()) {
    stderr.writeln('Android host project is missing. Run Flutter bootstrap first.');
    exitCode = 1;
    return;
  }

  var xml = await manifest.readAsString();
  if (xml.contains('android.permission.INTERNET')) {
    stdout.writeln('Android internet permission already present.');
    return;
  }

  final openingTag = RegExp(r'<manifest\b[^>]*>');
  if (!openingTag.hasMatch(xml)) {
    stderr.writeln('Android manifest root element could not be located.');
    exitCode = 1;
    return;
  }

  xml = xml.replaceFirstMapped(
    openingTag,
    (match) => '${match.group(0)}\n    <uses-permission android:name="android.permission.INTERNET" />',
  );
  await manifest.writeAsString(xml);
  stdout.writeln('Prepared Android HTTPS API network permission.');
}
