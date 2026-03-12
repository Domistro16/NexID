"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { HelpCircle, MessageSquare, ArrowRight } from "lucide-react";
import Link from "next/link";

const faqData = [
  {
    question: "What is a .id domain?",
    answer:
      "A .id domain is a new top-level domain (TLD) specifically designed for content creators, artists, and innovators. It helps you establish a unique online identity and provides access to exclusive tools and communities within our ecosystem.",
  },
  {
    question: "How do I mint a .id domain?",
    answer:
      "You can mint your .id domain directly through our platform. Navigate to the 'Mint .id Domain' section, search for your desired name, and follow the simple steps. It's a quick process integrated with blockchain technology.",
  },
  {
    question: "What are the benefits of Nex Academy courses?",
    answer:
      "Our courses are AI-powered and tailored for Web3 creators. You get personalized learning paths, practical skills applicable in the creator economy, and access to a supportive community. Plus, many courses offer exclusive content for .id domain holders.",
  },
  {
    question: "Is there a refund policy for courses?",
    answer:
      "Yes, we offer a satisfaction guarantee. If you're not happy with a course, you can request a refund within a specified period (usually 14 days), provided you haven't completed a significant portion of the course content. Please check the specific terms for each course.",
  },
  {
    question: "How is AI used in the learning experience?",
    answer:
      "AI helps personalize your learning journey by recommending relevant content, adapting to your pace, and providing intelligent feedback. It also powers some of our course creation tools and helps keep our curriculum up-to-date with the latest Web3 trends.",
  },
];

const FaqSection = () => {
  return (
    <section className="py-16 md:py-24 crypto-pattern">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-4"
        >
          <div className="inline-flex items-center px-4 py-1.5 rounded-full glass-effect mb-3 border border-primary/30 shadow-sm">
            <HelpCircle className="w-5 h-5 text-primary mr-2" />
            <span className="text-sm font-semibold text-slate-200">
              FAQ Hub
            </span>
          </div>
        </motion.div>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-center mb-12 md:mb-16 leading-tight"
        >
          Frequently Asked{" "}
          <span className="primary-gradient-text">Questions!</span>
        </motion.h2>

        <div className="grid md:grid-cols-3 gap-8 md:gap-12 items-start">
          {/* Left Column: Still Have Questions Card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="md:col-span-1 glass-effect p-6 sm:p-8 rounded-xl shadow-xl flex flex-col items-center text-center h-full"
          >
            <MessageSquare className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-2xl font-semibold text-slate-50 mb-3">
              Still Have Questions?
            </h3>
            <p className="text-slate-300 mb-6 text-sm leading-relaxed">
              Our dedicated support team is happy to help. Don't hesitate to
              reach out!
            </p>
            <div className="flex -space-x-2 mb-6 justify-center">
              <img
                className="inline-block h-10 w-10 rounded-full ring-2 ring-background object-cover"
                alt="Support team member 1"
                src="https://images.unsplash.com/photo-1628749530065-3078f328d100"
              />
              <img
                className="inline-block h-10 w-10 rounded-full ring-2 ring-background object-cover"
                alt="Support team member 2"
                src="https://images.unsplash.com/photo-1702904750413-dcdd75d4386a"
              />
              <img
                className="inline-block h-10 w-10 rounded-full ring-2 ring-background object-cover"
                alt="Support team member 3"
                src="https://images.unsplash.com/photo-1628749530065-3078f328d100"
              />
            </div>
            <Button
              asChild
              size="lg"
              className="w-full bg-gradient-to-r from-primary to-orange-400 hover:from-orange-500 hover:to-primary text-background font-semibold text-md px-6 py-3 rounded-lg shadow-lg hover:shadow-primary/40 transition-all duration-300 transform hover:scale-105 group"
            >
              <a href="https://discord.gg/Sj8fBeSy4D">
                {" "}
                {/* Assuming you have a contact page route */}
                Join Our Discord{" "}
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>
            <Link
              href="/academy"
              className="mt-4 text-sm text-primary hover:underline"
            >
              Or Start Learning Now
            </Link>
          </motion.div>

          {/* Right Column: Accordion FAQs */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="md:col-span-2"
          >
            <Accordion type="single" collapsible className="w-full space-y-3">
              {faqData.map((item, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="glass-effect rounded-lg px-6 border-primary/20"
                >
                  <AccordionTrigger className="text-md sm:text-lg font-semibold hover:no-underline text-slate-100">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
