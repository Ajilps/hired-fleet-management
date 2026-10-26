import 'package:driver_app/core/theme/app_colors.dart';
import 'package:driver_app/core/theme/app_radius.dart';
import 'package:driver_app/core/theme/app_spacing.dart';
import 'package:driver_app/core/theme/app_text_style.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_app_bar.dart';
import 'package:driver_app/presentation/widgets/auth_widgets/auth_button.dart';
import 'package:driver_app/presentation/widgets/register_widgets/application_input_card.dart';
import 'package:flutter/material.dart';

class DriverDocumentsScreen extends StatelessWidget {
  const new({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: authAppBar(context, 'Your Documents'),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(height: AppSpacing.gap),
              Text('Finish Your Application', style: AppTextStyles.tittle),
              SizedBox(height: AppSpacing.gap),
              Text(
                'Upload the four documents for your \ndriver profile',
                style: AppTextStyles.caption,
              ),
              SizedBox(height: AppSpacing.section),
              Container(
                width: double.infinity,
                padding: EdgeInsets.symmetric(vertical: 20, horizontal: 15),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadius.card),
                  color: AppColors.surface,
                  border: Border.all(width: 1, color: AppColors.cardBorder),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Documents 3 of 4 uploaded',
                      style: AppTextStyles.fieldLabel,
                    ),
                    SizedBox(height: 10),
                    ApplicationInputCard(
                      label: 'Driving Licence',
                      icon: Icons.card_membership_outlined,
                      subtitle: 'Upload required',
                      onTap: () {},
                    ),

                    const SizedBox(height: 12),

                    ApplicationInputCard(
                      label: 'Aadhaar Card',
                      icon: Icons.badge_outlined,
                      subtitle: 'Upload required',
                      onTap: () {},
                    ),

                    const SizedBox(height: 12),

                    ApplicationInputCard(
                      label: 'PAN Card',
                      icon: Icons.credit_card_outlined,
                      subtitle: 'Upload required',
                      onTap: () {},
                    ),

                    const SizedBox(height: 12),

                    ApplicationInputCard(
                      label: 'Police Clearance Certificate (PCC)',
                      icon: Icons.verified_user_outlined,
                      subtitle: 'Upload required',
                      onTap: () {},
                    ),
                  ],
                ),
              ),
              SizedBox(height: 30),
              AuthButtonWidget(text: 'Compleate Remaining Upload'),
            ],
          ),
        ),
      ),
    );
  }
}
