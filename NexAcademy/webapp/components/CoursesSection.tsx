"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Target, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";

const CoursesSection = ({
  courses,
  title = "AI-Powered Learning Hub",
  subtitle,
  isHomePage = false,
}: any) => {
  const defaultSubtitle = isHomePage
    ? "Explore our top AI-driven courses designed for Web3 creators. Mint your .id domain to unlock full potential."
    : 'Mint your <code class="text-primary font-bold p-1.5 rounded-md bg-primary/10 shadow-sm">.id</code> domain to unlock these exclusive AI-driven courses and supercharge your skills.';

  const displayedCourses = isHomePage ? courses.slice(0, 3) : courses;

  return (
    <section id="courses" className="py-20 md:py-28 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          viewport={{ once: true, amount: 0.3 }}
          className="text-center"
        >
          <h2 className="section-title">
            {title.includes("AI-Powered") ? (
              <>
                AI-Powered{" "}
                <span className="primary-gradient-text">Learning Hub</span>
              </>
            ) : title.includes("Featured") ? (
              <>
                Featured{" "}
                <span className="primary-gradient-text">AI Courses</span>
              </>
            ) : (
              title
            )}
          </h2>
          <p
            className="section-subtitle"
            dangerouslySetInnerHTML={{ __html: subtitle || defaultSubtitle }}
          ></p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
          {displayedCourses.map((course: any, index: any) => {
            const IconComponent = Target;
            // For consistency, all cards in this section will show the "View Details" / "Mint to enroll" state
            // The isEnrolledInCourse logic was specific to demoing one card differently, which we're removing.
            return (
              <motion.div
                key={course.id || index}
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.6,
                  delay: index * 0.1,
                  ease: "easeOut",
                }}
                viewport={{ once: true, amount: 0.3 }}
                className="glass-effect rounded-xl overflow-hidden group card-hover-effect flex flex-col"
              >
                <div className="h-52 bg-gradient-to-br from-primary/10 to-orange-400/10 relative overflow-hidden">
                  <img
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-400 ease-in-out"
                    alt={`${course.title} course preview`}
                    src="https://images.unsplash.com/photo-1641772063406-fba515758ded"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1.5 bg-primary/90 text-background rounded-full text-xs font-semibold shadow-md">
                      {course.level}
                    </span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/70 to-transparent"></div>
                  <div className="absolute bottom-3 left-4 flex items-center space-x-2">
                    <IconComponent className="w-5 h-5 text-primary" />
                    <span className="text-xs text-gray-200 font-semibold">
                      {course.duration}
                    </span>
                  </div>
                </div>

                <div className="p-6 flex flex-col flex-grow">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors duration-200">
                    {course.title}
                  </h3>
                  <p className="text-sm text-gray-400 mb-5 h-12 line-clamp-2 flex-grow">
                    {course.description.split(" Access with .id domain.")[0]}
                  </p>

                  <div className="mt-auto">
                    {/* Always show "View Details" button for consistency in this section */}
                    <Link href={`/academy/campaign/${course.id}`}>
                      <Button className="w-full bg-gradient-to-r from-primary to-orange-400 hover:from-orange-500 hover:to-primary text-background font-semibold text-sm py-3 rounded-lg shadow-lg hover:shadow-primary/40 transition-all duration-300 transform hover:scale-105">
                        View Details
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                    {/* Always show "Mint .id domain to enroll" text */}
                    <p className="text-xs text-amber-400 mt-2 text-center flex items-center justify-center">
                      <Lock size={12} className="mr-1" /> Mint .id domain to
                      enroll
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
        {isHomePage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            viewport={{ once: true }}
            className="text-center mt-16"
          >
            <Link href="/academy">
              <Button
                size="lg"
                variant="outline"
                className="border-primary/70 text-primary hover:bg-primary/10 hover:border-primary text-md px-8 py-4 rounded-lg transition-all duration-300 transform hover:scale-105 group"
              >
                Explore All Courses{" "}
                <ArrowRight className="w-5 h-5 ml-2.5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  );
};

export default CoursesSection;
