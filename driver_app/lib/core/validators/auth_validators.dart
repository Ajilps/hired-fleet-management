
class AuthValidator {
  static String? validateName(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Please enter your full name';
    }

    if (value.trim().length < 3) {
      return 'Name must be at least 3 characters';
    }

    return null;
  }

  static String? validatePhone(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Please enter your phone number';
    }

    if (!RegExp(r'^[0-9]{10}$').hasMatch(value.trim())) {
      return 'Enter a valid 10-digit phone number';
    }

    return null;
  }

  static String? validateEmail(String? value) {
    if (value == null || value.trim().isEmpty) {
      return 'Please enter your email';
    }

    if (!RegExp(
      r'^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$',
    ).hasMatch(value.trim())) {
      return 'Enter a valid email address';
    }

    return null;
  }

  static String? validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your password';
    }

    if (value.length < 8) {
      return 'Password must be at least 8 characters';
    }

    return null;
  }
}

