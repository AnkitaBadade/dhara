/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Footer } from './components/Footer';
import { Screen1_PhcStaff } from './components/Screen1_PhcStaff';
import { Screen2_DistrictOfficer } from './components/Screen2_DistrictOfficer';
import { Screen3_StateHub } from './components/Screen3_StateHub';
import { Screen4_Citizen } from './components/Screen4_Citizen';
import { TopBar } from './components/TopBar';
import { AppProvider, useApp } from './context/AppContext';

function MainLayout() {
  const { selectedRole } = useApp();

  const roleTypographyClass =
    selectedRole === 'phc_staff'
      ? 'screen-staff-body text-[18px]'
      : selectedRole === 'citizen'
      ? 'screen-citizen-body text-[18px]'
      : 'screen-district-body text-[16px]';

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#101828]">
      {/* Universal Top Bar with Accessibility bar, Header, and Role Navigation */}
      <TopBar />

      {/* Main Content Area with Skip Link Anchor and Role-Specific Typography */}
      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 pb-12 bg-[#F5F7FA] focus:outline-none ${roleTypographyClass}`}
      >
        {selectedRole === 'phc_staff' && <Screen1_PhcStaff />}
        {selectedRole === 'district_officer' && <Screen2_DistrictOfficer />}
        {selectedRole === 'state_hub' && <Screen3_StateHub />}
        {selectedRole === 'citizen' && <Screen4_Citizen />}
      </main>

      {/* Prototype Footer */}
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
