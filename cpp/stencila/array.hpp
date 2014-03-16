#pragma once

#include <fstream>
#include <set>

#include <stencila/exception.hpp>
#include <stencila/dimension.hpp>
#include <stencila/query.hpp>
#include <stencila/traits.hpp>

namespace Stencila {

/**
 * Dynamic array class
 *
 * Unlike `Grid`s, `Array`s can be resised. 
 * This class is a wrapper around the C++ std::vector class but has an interface that
 * is consistent static `Grid`s (e.g. sizing by dimensions)
 */
template<
	typename Type = double
>
class Array {
private:

    std::vector<Dimension<>> dimensions_;
	std::vector<Type> values_;

public:
    
    /**
     * Default constructor
     */
   	Array(void){
	}

    /**
     * Construct from a dimension
     */
    Array(const Dimension<>& dim){
        dimensions_.push_back(dim);
        values_.resize(dim.size());
    }

    /**
     * Construct from one or more dimensions
     */
    Array(const std::vector<Dimension<>>& dims){
        uint size = 1;
        for(auto& dim : dims){
            dimensions_.push_back(dim);
            size *= dim.size();
        }
        values_.resize(size);
    }

    /**
     * Construct with a particular size
     */
    Array(const int& size):
    	values_(size){
    }

    /**
     * Construct with a particular size and value for each cell
     */
    Array(const int& size, const Type& value):
    	values_(size){
    	for(auto& item : *this) item = value;
    }

	/**
	 * Construct from a std::initializer_list (e.g. `{1.23,3.14,5.98}`)
	 */
    template<class Value>
	Array(const std::initializer_list<Value>& values){
        construct_from_container_(values);
    }

    /**
     * Construct from a std::vector
     */
    template<class Value>
    Array(const std::vector<Value>& values){
        construct_from_container_(values);
    }

    /**
     * Construct from a std::array
     */
    template<class Value,size_t Size>
    Array(const std::array<Value,Size>& values){
        construct_from_container_(values);
    }

private:

    /**
     * Private helper function for constructing from a container object
     */
    template<class Container>
    void construct_from_container_(const Container& other){
        size(other.size());
        unsigned int index = 0;
        for(auto& item : other){
            values_[index] = item;
            index++;
        }
    }


public:

    /**
     * Implicit conversion to a std::vector
     */
    operator std::vector<Type>() {
        return values_;
    }
    
	/**
	 * Get the size of the array.
	 */
    unsigned int size(void) const {
        return values_.size();
    }
    
	/**
	 * Set the size of the array.
	 */
    Array size(unsigned int size) {
        values_.resize(size);
        return *this;
    }
    
 	/**
	 * @name Iterator interface
	 *
	 * @{
	 */

   	typename std::vector<Type>::iterator begin(void) {
		return values_.begin();
	}

	typename std::vector<Type>::const_iterator begin(void) const {
		return values_.begin();
	}

	typename std::vector<Type>::iterator end(void) {
		return values_.end();
	}

	typename std::vector<Type>::const_iterator end(void) const {
		return values_.end();
	}    

    /**
     * @}
     */
    

	/**
	 * @name Subscript operators
	 *
	 * Return the value at the linear index
	 * 
	 * @{
	 */

    Type& operator[](unsigned int index) {
        return values_[index];
    }

    const Type& operator[](unsigned int index) const {
        return values_[index];
    }

    /**
     * @}
     */
    

    /**
     * @name Subscript operators
     *
     * Return the value at the linear index
     * 
     * @{
     */

    template<
        class Class, typename Result
    >
    Result operator()(Aggregate<Class,Result>& aggregate) const{
        for(auto& value : *this) aggregate.append(value);
        return aggregate.result();
    }

    Array<> operator()(const Query& query) const {
        for(Clause* clause : query){
            if(Counter* counter = dynamic_cast<Counter*>(clause)){
                for(auto& value : *this) counter->append();
                return {counter->result()};
            } else if(Aggregater<double,double>* aggregater = dynamic_cast<Aggregater<double,double>*>(clause)){
                for(auto& value : *this) aggregater->append(value);
                return {aggregater->result()};
            } else {
                STENCILA_THROW(Exception,"Query clause can not be applied");
            }
        }
        return Array<>();
    }

    /**
     * @}
     */

   	/**
   	 * Modification methods
   	 */

    /**
     * Append a value to the array
     * 
     * @param value Value to append
     */
    void append(const Type& value) {
        return values_.push_back(value);
    }

    /**
     * Remove all items equal to a particular value
     * 
     * @param value Value to be removed
     */
    void remove(const Type& value){
    	values_.erase(std::remove(values_.begin(), values_.end(), value), values_.end());
    }

    /**
     * Erase the element at a particular position
     */
    void erase(unsigned int index) {
        return values_.erase(values_.begin()+index);
    }

    /**
     * @}
     */
    
};

} //namespace Stencila
