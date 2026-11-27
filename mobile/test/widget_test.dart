import 'package:flutter_test/flutter_test.dart';
import 'package:mina_companion/main.dart';

void main() {
  testWidgets('platform foundation shell renders', (tester) async {
    await tester.pumpWidget(const MinaCompanionFoundation());
    expect(find.text('Mina platform foundation'), findsOneWidget);
  });
}
