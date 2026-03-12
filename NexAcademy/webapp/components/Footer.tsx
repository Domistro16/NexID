// @ts-nocheck
"use client";

import React from "react";
import { FaDiscord, FaTiktok } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

const Footer = () => {
  const socialLinks = [
    { icon: FaXTwitter, href: "https://x.com/safuverse", label: "Twitter" },
    {
      icon: FaTiktok,
      href: "https://www.tiktok.com/@level3ai",
      label: "Tiktok",
    },
    {
      icon: FaDiscord,
      href: "https://discord.gg/Sj8fBeSy4D",
      label: "Discord",
    },
  ];

  const footerSections = [
    {
      title: "Platform",
      links: [
        "AI Courses",
        "Earn Crypto",
        ".id Domains",
        "Community Hub",
        "Leaderboards",
      ],
    },
    {
      title: "Company",
      links: ["About Us", "Careers", "Blog", "Press Kit", "Partnerships"],
    },
    {
      title: "Support",
      links: [
        "Help Center",
        "Documentation",
        "Contact Us",
        "FAQs",
        "Status Page",
      ],
    },
    {
      title: "Legal",
      links: [
        "Privacy Policy",
        "Terms of Service",
        "Cookie Policy",
        "Disclaimer",
      ],
    },
  ];
  return (
    <footer className="py-16 md:py-20  border-t-[0.2px] border-gray-500 px-4 sm:px-6 lg:px-8 rounded-t-full bg-gradient-to-b from-purple-950/20 to-background/70">
      <div className="flex flex-col gap-9 items-center pb-10">
        <div className="flex justify-center">
          <img src="/nexid_logo.png" className="h-10" />
        </div>
        <p className="text-center w md:w-[40%] font-semibold">
          Empowering the next generation of Web3 content creators with AI-driven
          learning and decentralized earning opportunities.
        </p>

        <div className="flex space-x-5">
          {socialLinks.map((social) => (
            <a
              key={social.label}
              href={social.href}
              aria-label={social.label}
              className="text-gray-500 hover:text-primary transition-colors duration-200"
            >
              <social.icon size={22} />
            </a>
          ))}
        </div>
        <div className=" flex flex-col md:flex-row justify-between pt-3 md:gap-5 items-center">
          <p className="text-sm text-whit mb-4 md:mb-0">
            (c) {new Date().getFullYear()} Nex Academy Labs
          </p>
          <p className="text-sm text-white">
            Product of{" "}
            <span className="text-[#FFB000] font-bold">Level 3 Labs</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
