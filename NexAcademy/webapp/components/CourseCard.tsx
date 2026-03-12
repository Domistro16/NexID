"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Clock, Star } from "lucide-react";
import { OnChainCourse } from "@/lib/constants";
import { useTheme } from "@/app/providers";

// Props interface that matches how the component is used across the codebase
interface CourseCardProps {
  course: OnChainCourse;
  animationDelay?: number;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  animationDelay = 0,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <motion.div
      className="h-full"
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: animationDelay, ease: "easeOut" }}
      viewport={{ once: true, amount: 0.2 }}
    >
      <Link
        href={`/academy/campaign/${course.id}`}
        className={`group relative flex flex-col h-full rounded-[28px] border overflow-hidden transition duration-500 hover:-translate-y-3 ${isDark
          ? 'bg-[#12121a] border-[#2a2a3a] shadow-[0_18px_55px_rgba(0,0,0,0.4)] hover:shadow-[0_40px_110px_rgba(255,251,0,0.15)] hover:border-[#ffb000]/50'
          : 'bg-white/70 border-black/5 shadow-[0_18px_55px_rgba(15,23,42,0.10)] hover:shadow-[0_40px_110px_rgba(15,23,42,0.32)] hover:border-[#fcd34d]'
          }`}
        style={{ perspective: "900px" }}
      >
        {/* Course Preview Image/Pattern */}
        <div className={`w-full h-[230px] md:h-[270px] border-b overflow-hidden flex items-center justify-center p-4 ${isDark ? 'bg-[#1a1a24] border-[#2a2a3a]' : 'bg-white border-black/5'
          }`}>
          <div
            className={`w-full h-full rounded-[16px] overflow-hidden transition-transform duration-500 group-hover:scale-[1.04] ${isDark ? 'border-2 border-[#2a2a3a]' : 'border-4 border-white shadow-[0_10px_40px_rgba(0,0,0,0.08)]'
              }`}
            style={{ transformStyle: "preserve-3d" }}
          >
            {course.thumbnailUrl ? (
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center flex-col gap-2 text-center px-4 ${isDark
                ? 'bg-gradient-to-br from-[#1a1a2e] via-[#252540] to-[#1a1a3e]'
                : 'bg-[radial-gradient(circle_at_0%_0%,#fff3cd,transparent_55%),radial-gradient(circle_at_100%_120%,#ffe1a3,transparent_55%)]'
                }`}>
                <span className="text-3xl">📚</span>
                <span className={`text-sm font-semibold line-clamp-2 ${isDark ? 'text-[#ffb000]' : 'text-[#aa7a09]'
                  }`}>
                  {course.category}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Course Content */}
        <div className={`p-5 flex flex-col flex-1 gap-2 ${isDark ? 'bg-[#12121a]' : ''}`}>
          {/* Category and Level Badge */}
          <div className="flex items-center justify-between text-[11px]">
            <span className={`px-2 py-1 font-semibold rounded-full ${isDark ? 'bg-[#ffb000]/10 text-[#ffb000] border border-[#ffb000]/30' : 'bg-[#fef3c7] text-[#92400e]'
              }`}>
              {course.level}
            </span>
            <span className={isDark ? 'text-gray-400' : 'text-[#777]'}>{course.duration}</span>
          </div>

          {/* Title */}
          <h3 className={`font-semibold text-[16px] leading-snug line-clamp-2 mt-1 ${isDark ? 'text-white' : 'text-[#111]'
            }`}>
            {course.title}
          </h3>

          {/* Description */}
          <p className={`text-[13px] leading-relaxed line-clamp-2 ${isDark ? 'text-gray-400' : 'text-[#555]'
            }`}>
            {course.description}
          </p>

          {/* Stats Row */}
          <div className={`flex items-center gap-4 mt-2 text-[11px] ${isDark ? 'text-gray-500' : 'text-[#777]'
            }`}>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Number(course.totalLessons)} lessons
            </span>
            <span className="flex items-center gap-1">
              <Star className={`w-3 h-3 ${isDark ? 'text-[#ffb000]' : 'text-[#f5a623]'}`} />
              New
            </span>
          </div>

          {/* Instructor */}
          <div className={`flex items-center justify-between mt-2 pt-2 border-t ${isDark ? 'border-[#2a2a3a]' : 'border-black/5'
            }`}>
            <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-[#555]'}`}>
              By {course.instructor}
            </span>
            <span className={`text-[11px] font-semibold group-hover:underline ${isDark ? 'text-[#ffb000]' : 'text-[#92400e]'
              }`}>
              View details →
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default CourseCard;
