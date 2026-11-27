import 'package:flutter/material.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MinaCompanionFoundation());
}

/// Deliberately minimal bootstrap shell. Product UI is out of scope for this
/// foundation-only phase.
class MinaCompanionFoundation extends StatelessWidget {
  const MinaCompanionFoundation({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Mina',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4)),
        useMaterial3: true,
      ),
      home: const _FoundationScreen(),
    );
  }
}

class _FoundationScreen extends StatelessWidget {
  const _FoundationScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mina')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.devices_other, size: 48),
              SizedBox(height: 16),
              Text(
                'Mina platform foundation',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 8),
              Text(
                'Platform bootstrap only. The application interface and device features will be added in a later phase.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
