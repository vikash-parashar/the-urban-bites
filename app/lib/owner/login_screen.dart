import 'package:flutter/material.dart';

import '../api.dart';
import '../demo.dart';
import '../theme.dart';
import 'owner_home.dart';

/// Staff sign-in for the owner (Manjeet) and the admin. Customers never need this.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool busy = false;
  bool hide = true;
  String? error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await Api.instance.signIn(_email.text.trim(), _password.text);
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const OwnerHome()), (_) => false);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
            const Wordmark(size: 34),
            const SizedBox(height: 8),
            const Text('Staff sign in', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const Text('For the owner and the admin. Orders, menu and earnings.', style: TextStyle(color: Brand.muted)),
            const SizedBox(height: 24),
            if (demoMode) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Demo app', style: TextStyle(fontWeight: FontWeight.w800, color: Brand.gold)),
                    const SizedBox(height: 4),
                    const Text('Test logins. Everything stays on this phone.', style: TextStyle(color: Brand.muted)),
                    const SizedBox(height: 8),
                    const SelectableText('Owner: $demoOwnerEmail\nAdmin: $demoAdminEmail\nPassword: $demoPassword'),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      OutlinedButton(
                        onPressed: () => setState(() {
                          _email.text = demoOwnerEmail;
                          _password.text = demoPassword;
                        }),
                        child: const Text('Fill owner login'),
                      ),
                      TextButton(
                        onPressed: () async {
                          await DemoServer.instance.reset();
                          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Demo data reset.')));
                        },
                        child: const Text('Reset demo data'),
                      ),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 16),
            ],
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _password,
              obscureText: hide,
              autofillHints: const [AutofillHints.password],
              onSubmitted: (_) => _signIn(),
              decoration: InputDecoration(
                labelText: 'Password',
                suffixIcon: IconButton(
                  tooltip: hide ? 'Show password' : 'Hide password',
                  icon: Icon(hide ? Icons.visibility : Icons.visibility_off),
                  onPressed: () => setState(() => hide = !hide),
                ),
              ),
            ),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Brand.danger))),
            const SizedBox(height: 20),
            FilledButton(onPressed: busy ? null : _signIn, child: Text(busy ? 'Signing in…' : 'Sign in')),
          ]),
        ),
      ),
    );
  }
}
