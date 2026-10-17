import 'package:driver_app/core/enum/snack_bar.dart';
import 'package:driver_app/core/route/app_navigations.dart';
import 'package:driver_app/core/route/app_routes.dart';
import 'package:driver_app/core/snack_bar/app_snack_bar.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class AuthController extends ChangeNotifier {
  final TextEditingController nameController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController passwordController = TextEditingController();
  final TextEditingController documentController = TextEditingController();
  bool isLoading = false;
  String path = '';

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  void onContinueDocuments(
    GlobalKey<FormState> globalKey,
    BuildContext context,
  ) {
    if (!globalKey.currentState!.validate()) {
      AppSnackBar.show(
        context,
        message: 'Please enter valid details.',
        type: SnackType.error,
      );
      return;
    }
    if (nameController.text.trim().isEmpty ||
        phoneController.text.trim().isEmpty ||
        emailController.text.trim().isEmpty ||
        passwordController.text.isEmpty) {
      AppSnackBar.show(
        context,
        message: 'Please fill in all required fields.',
        type: SnackType.error,
      );
      return;
    }

    isLoading = true;
    notifyListeners();

    try {
      AppNavigation.pushNamed(context, AppRoutes.driverDocuments);
    } catch (e) {
      AppSnackBar.show(
        context,
        message: 'Something went wrong. Please try again.',
        type: SnackType.error,
      );
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> pickImage(BuildContext context) async {
    isLoading = true;
    notifyListeners();

    try {
      final picker = ImagePicker();

      final XFile? image = await picker.pickImage(source: ImageSource.camera);

      if (image != null) {
        path = image.path;
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to capture image. Please try again.'),
          ),
        );
      }
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }

  Future<void> pickFile(BuildContext context) async {
    isLoading = true;
    notifyListeners();

    try {
      PlatformFile? result = await FilePicker.pickFile();

      if (result != null) {
        path = result.xFile.path;
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to select file. Please try again.'),
          ),
        );
      }
    } finally {
      isLoading = false;
      notifyListeners();
    }
  }
}
