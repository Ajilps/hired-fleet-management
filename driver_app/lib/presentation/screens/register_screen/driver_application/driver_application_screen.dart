import 'package:driver_app/core/route/app_navigations.dart';
import 'package:driver_app/core/route/app_routes.dart';
import 'package:driver_app/core/theme/app_colors.dart';
import 'package:driver_app/core/theme/app_spacing.dart';
import 'package:driver_app/core/validators/auth_validators.dart';
import 'package:driver_app/presentation/controllers/auth_controller/auth_controller.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_app_bar.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_banner.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_button.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_label.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_text_form_field.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class DriverApplicationScreen extends StatelessWidget {
  DriverApplicationScreen({super.key});

  final GlobalKey<FormState> _globalKey = GlobalKey<FormState>();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: authAppBar(context,'Driver Application'),
      body: Consumer<AuthController>(
        builder: (context, value, child) {
          return SafeArea(
            child: SingleChildScrollView(
              child: Form(
                key: _globalKey,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    children: [
                      SizedBox(height: AppSpacing.gap),
                      AuthBanner(
                        firstLabel: 'Your Next Journey',
                        secondLabel: 'Starts Here',
                      ),
                
                      const SizedBox(height: AppSpacing.section),
                
                      AuthLabel(label: 'Full Name *'),
                      const SizedBox(height: AppSpacing.gap),
                      AuthTextFormField(
                        controller: value.nameController,
                        validator: AuthValidator.validateName,
                        hint: 'Enter your full name',
                        prefixIcon: Icons.person_outline,
                        keyboardType: TextInputType.name,
                      ),
                
                      const SizedBox(height: AppSpacing.section),
                
                      AuthLabel(label: 'Phone Number *'),
                      const SizedBox(height: AppSpacing.gap),
                      AuthTextFormField(
                        controller: value.phoneController,
                        validator: AuthValidator.validatePhone,
                        hint: 'Enter your phone number',
                        prefixIcon: Icons.phone_outlined,
                        keyboardType: TextInputType.phone,
                      ),
                
                      const SizedBox(height: AppSpacing.section),
                
                      AuthLabel(label: 'Email Address *'),
                      const SizedBox(height: AppSpacing.gap),
                      AuthTextFormField(
                        controller: value.emailController,
                        validator: AuthValidator.validateEmail,
                        hint: 'Enter your email address',
                        prefixIcon: Icons.email_outlined,
                        keyboardType: TextInputType.emailAddress,
                      ),
                
                      const SizedBox(height: AppSpacing.section),
                
                      AuthLabel(label: 'Password *'),
                      const SizedBox(height: AppSpacing.gap),
                      AuthTextFormField(
                        controller: value.passwordController,
                        validator: AuthValidator.validatePassword,
                        hint: 'Enter your password',
                        prefixIcon: Icons.lock_outline,
                        obscureText: true,
                      ),
                      SizedBox(height: AppSpacing.section),
                      AuthButtonWidget(
                        onPressed: () => value.onContinueDocuments(_globalKey, context),
                        text: 'Continue to Documents',
                      ),
                      SizedBox(height: AppSpacing.screen),
                      AuthButtonWidget(
                        backgroundColor: AppColors.background,
                        borderColor: AppColors.outline,
                        textColor: AppColors.textPrimary,
                        text: 'Already Registered ? Sign In',
                        onPressed: () => AppNavigation.pushReplacementNamed(
                          context,
                          AppRoutes.login,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.section),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

 
}
