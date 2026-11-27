import 'package:flutter/widgets.dart';

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
    return WidgetsApp(
      title: 'Mina',
      color: const Color(0xFF6750A4),
      builder: (context, child) => const _FoundationScreen(),
    );
  }
}

class _FoundationScreen extends StatelessWidget {
  const _FoundationScreen();

  @override
  Widget build(BuildContext context) {
    return const Directionality(
      textDirection: TextDirection.ltr,
      child: ColoredBox(
        color: Color(0xFFF7F5FA),
        child: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
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
      ),
    );
  }
}
