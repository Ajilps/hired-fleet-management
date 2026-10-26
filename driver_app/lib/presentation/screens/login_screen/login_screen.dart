import 'package:driver_app/core/route/app_navigations.dart';
import 'package:driver_app/core/route/app_routes.dart';
import 'package:driver_app/core/theme/app_colors.dart';
import 'package:driver_app/core/theme/app_spacing.dart';
import 'package:driver_app/core/theme/app_text_style.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_banner.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_button.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_label.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_text_form_field.dart';
import 'package:flutter/material.dart';

class LoginScreen extends StatelessWidget {
  const new({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text('Driver Sign In'),
      ),
      body: SingleChildScrollView(
        child: Form(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              children: [
                SizedBox(height: AppSpacing.section),
                AuthBanner(),
                SizedBox(height: AppSpacing.section),
                AuthLabel(label: 'Email Address'),
                SizedBox(height: AppSpacing.gap),
                AuthTextFormField(
                  hint: 'Enter your email',
                  prefixIcon: Icons.email_outlined,
                  keyboardType: TextInputType.emailAddress,
                ),
                SizedBox(height: AppSpacing.section),
                AuthLabel(label: 'PassWord'),
                SizedBox(height: AppSpacing.gap),
                AuthTextFormField(
                  hint: 'Enter your password',
                  prefixIcon: Icons.lock_outline,
                  obscureText: true,
                ),
                SizedBox(height: AppSpacing.spacing),

                AuthButtonWidget(onPressed: () {}, text: 'Sign In'),
                SizedBox(height: AppSpacing.screen),
                AuthButtonWidget(
                  backgroundColor: AppColors.background,
                  borderColor: AppColors.outline,
                  textColor: AppColors.textPrimary,
                  text: 'Apply As A Driver',
                  onPressed: () =>
                      AppNavigation.pushNamed(context, AppRoutes.driverApplication),
                ),
                SizedBox(height: AppSpacing.spacing),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: 'Need Access ? ',
                        style: AppTextStyles.caption,
                      ),
                      TextSpan(
                        text: 'Contact Your HireD team',
                        style: AppTextStyles.label,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
