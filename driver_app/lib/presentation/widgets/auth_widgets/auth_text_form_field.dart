
import 'package:flutter/material.dart';


class AuthTextFormField extends StatefulWidget {
  const AuthTextFormField({
    super.key,
    required this.hint,
    this.controller,
    this.validator,
    this.obscureText = false,
    this.keyboardType,
    this.prefixIcon,
  });

  final String hint;
  final TextEditingController? controller;
  final String? Function(String?)? validator;
  final bool obscureText;
  final TextInputType? keyboardType;
  final IconData? prefixIcon;

  @override
  State<AuthTextFormField> createState() => _AuthTextFormFieldState();
}

class _AuthTextFormFieldState extends State<AuthTextFormField> {
  final ValueNotifier<bool> _isobcure = ValueNotifier(false);
  @override
  void initState() {
    _isobcure.value = widget.obscureText;
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: _isobcure,
      builder: (context, value, child) {
        return TextFormField(
          controller: widget.controller,
          validator: widget.validator,
          keyboardType: widget.keyboardType,
          obscureText: value,
          decoration: InputDecoration(
            hintText: widget.hint,
            prefixIcon: widget.prefixIcon != null
                ? Icon(widget.prefixIcon)
                : null,
            suffixIcon: widget.obscureText
                ? IconButton(
                    onPressed: () {
                      _isobcure.value = !value;
                    },
                    icon: Icon(
                      value
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                    ),
                  )
                : null,
          ),
        );
      },
    );
  }
}
